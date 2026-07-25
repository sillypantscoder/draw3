from server_lib import SafeDict, HTTPServer, HTTPResponse, read_file
import wslib
import typing
import json
import datetime
import os
import random
import zip_lib

hostName = "0.0.0.0"
serverPort = 8063

def dt(time: datetime.datetime | None = None) -> str:
	timezone = datetime.timezone(datetime.timedelta(hours=-6))
	t = datetime.datetime.now(timezone)
	if time != None: t = time
	return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][t.weekday()] + \
		", " + ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][t.month] + \
		" " + str(t.day) + ("th" if t.day//10 == 1 else ("st" if t.day%10 == 1 else ("nd" if t.day%10 == 2 else ("rd" if t.day%10 == 3 else "th")))) + \
		" at " + str(((t.hour - 1) % 12) + 1) + ":" + str(t.minute).rjust(2, '0') + ":" + str(t.second).rjust(2, '0') + " " + ("AM" if t.hour < 12 else "PM")

class SceneObject(typing.TypedDict):
	layer: int
	typeID: str
	data: dict[str, typing.Any]
	blob: bytes | None

class Whiteboard:
	def __init__(self, id: str, type: str):
		self.name: str = "New Whiteboard"
		self.type: str = type
		self.created: datetime.datetime = datetime.datetime.now()
		self.objects: dict[int, SceneObject] = {}
		self.id = id
	@staticmethod
	def generateID():
		id = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + random.choice("0123456789")
		while os.path.exists(f"whiteboards/{id}.zip"):
			id += "_" + random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + random.choice("0123456789")
		return id
	def saveObjectList(self):
		files = {
			"whiteboard.json": json.dumps({
				"name": self.name,
				"type": self.type,
				"created": self.created.isoformat(),
				"objects": { str(x): {
					"layer": self.objects[x]["layer"], "typeID": self.objects[x]["typeID"], "data": self.objects[x]["data"]
				} for x in self.objects.keys() }
			}, separators=(',', ':')).encode("UTF-8")
		}
		for k in self.objects:
			blob = self.objects[k]["blob"]
			if blob != None:
				files[f"{k}.dat"] = blob
		z = zip_lib.ZipFile(files)
		z.write_to_file(f"whiteboards/{self.id}.zip")
	def loadObjectList(self):
		if not os.path.isfile(f"whiteboards/{self.id}.zip"): return
		z = zip_lib.ZipFile.from_file(f"whiteboards/{self.id}.zip")
		# Load main whiteboard data
		whiteboard_data = json.loads(z.items["whiteboard.json"])
		self.name = whiteboard_data["name"]
		self.type = whiteboard_data["type"]
		self.created = datetime.datetime.fromisoformat(whiteboard_data["created"])
		# Load objects
		objects: dict[str, typing.Any] = whiteboard_data["objects"]
		self.objects = { int(x[0]): typing.cast(SceneObject, {
			"layer": x[1]["layer"],
			"typeID": x[1]["typeID"],
			"data": x[1]["data"],
			"blob": None
		}) for x in objects.items() }
		# Load blobs
		for item in z.items.keys():
			if not item.endswith(".dat"): continue
			objectID = int(item.split(".")[0])
			self.objects[objectID]["blob"] = z.items[item]
		# Done
		print("[Draw3] Loaded", len(self.objects), "objects for whiteboard with id", self.id, "of type", self.type, "(name: " + repr(self.name) + ")")

class Draw3Server(HTTPServer):
	def __init__(self, hostName: str, serverPort: int):
		super().__init__(hostName, serverPort)
		self.whiteboards: list[Whiteboard] = []
		# Load whiteboards
		if not os.path.exists("whiteboards"): os.mkdir("whiteboards")
		files = os.listdir("whiteboards")
		for f in files:
			w = Whiteboard(f.split(".")[0], "invalid")
			w.loadObjectList()
			self.whiteboards.append(w)
		# Start WebSocket server
		self.ws_server = wslib.WSServer(serverPort + 1)
		self.ws_server.events_on_connect.append(self.on_ws_connect)
		self.ws_server.events_on_message.append(self.on_ws_message)
		self.ws_server.events_on_disconnect.append(self.on_ws_disconnect)
		self.ws_server.run()
		self.clientWhiteboards: dict[int, Whiteboard | None] = {}
	def getWhiteboard(self, id: str):
		for w in self.whiteboards:
			if w.id == id:
				return w
		raise KeyError(id)
	def get(self, path: str, query: SafeDict, headers: SafeDict, cookies: SafeDict) -> HTTPResponse:
		if path == "/":
			return {
				"status": 200,
				"headers": {
					"Content-Type": "text/html"
				},
				"content": read_file("client/index.html")
			}
		elif path == "/whiteboard_data/ls":
			return {
				"status": 200,
				"headers": {
					"Content-Type": "text/plain"
				},
				"content": json.dumps([
					{ "name": w.name, "created": w.created.isoformat(), "id": w.id }
					for w in self.whiteboards
				]).encode("UTF-8")
			}
		elif path == "/utils.js":
			return {
				"status": 200,
				"headers": {
					"Content-Type": "text/javascript"
				},
				"content": read_file("client/utils.js")
			}
		elif path.startswith("/whiteboard/"):
			board_name = path.split("/")[2]
			if board_name not in [w.id for w in self.whiteboards]:
				return {
					"status": 404,
					"headers": {
						"Content-Type": "text/html"
					},
					"content": b""
				}
			return {
				"status": 200,
				"headers": {
					"Content-Type": "text/html"
				},
				"content": read_file("client/whiteboard.html")
			}
		elif path == "/whiteboard.js":
			return {
				"status": 200,
				"headers": {
					"Content-Type": "text/javascript"
				},
				"content": read_file("client/whiteboard.js")
			}
		elif path.startswith("/whiteboard_data/get_blob"):
			try:
				whiteboard = self.getWhiteboard(query.get("whiteboard"))
			except:
				return {
					"status": 404,
					"headers": {},
					"content": b"Whiteboard Not Found"
				}
			try:
				obj = whiteboard.objects[int(query.get("objectID"))]
			except:
				return {
					"status": 404,
					"headers": {},
					"content": b"Object Not Found"
				}
			return {
				"status": 200,
				"headers": {
					"Content-Type": "application/octet-stream"
				},
				"content": obj["blob"] or b""
			}
		# 404 page
		return {
			"status": 404,
			"headers": {},
			"content": b""
		}
	def post(self, path: str, query: SafeDict, body: bytes) -> HTTPResponse:
		if path == "/new":
			data = body.decode("UTF-8").split("\n")
			w = Whiteboard(Whiteboard.generateID(), data[0])
			self.whiteboards.append(w)
			w.name = data[1]
			print(f"[Draw3] [{dt()}] New whiteboard with id:", w.id, "type:", w.type, "name:", repr(w.name))
			return {
				"status": 200,
				"headers": {},
				"content": w.id.encode("UTF-8")
			}
		elif path == "/rename":
			data = body.decode("UTF-8").split("\n")
			id = data[0]
			newname = data[1]
			for w in self.whiteboards:
				if w.id == id:
					print(f"[Draw3] [{dt()}] Renamed whiteboard with id", w.id, "(old name:", repr(w.name) + ") to:", repr(newname))
					w.name = newname
					w.saveObjectList()
			return {
				"status": 200,
				"headers": {},
				"content": b""
			}
		elif path == "/set_blob":
			try:
				whiteboard = self.getWhiteboard(query.get("whiteboard"))
			except:
				return {
					"status": 400,
					"headers": {},
					"content": b"Whiteboard Not Found"
				}
			try:
				obj = whiteboard.objects[int(query.get("objectID"))]
			except:
				return {
					"status": 404,
					"headers": {},
					"content": b"Object Not Found"
				}
			obj["blob"] = body
			# Inform clients
			for client in self.ws_server.clients:
				if self.clientWhiteboards[client.id] == whiteboard:
					client.sendMessage(json.dumps({
						"type": "edit_object",
						"objectID": int(query.get("objectID")),
						"newData": obj["data"],
						"blobModified": True
					}))
			# Save whiteboard
			whiteboard.saveObjectList()
			return {
				"status": 200,
				"headers": {},
				"content": b""
			}
		return {
			"status": 404,
			"headers": {},
			"content": b""
		}
	def on_ws_connect(self, c: wslib.Client):
		self.clientWhiteboards[c.id] = None
	def on_ws_message(self, c: wslib.Client, message: str):
		# Set associated whiteboard
		whiteboard = self.clientWhiteboards[c.id]
		if whiteboard == None:
			# Set whiteboard
			whiteboard = self.getWhiteboard(message[1:])
			self.clientWhiteboards[c.id] = whiteboard
			# Get all objects
			if message[0] == "1":
				for o in [*whiteboard.objects]:
					objectData: dict[str, typing.Any] = {}
					objectData.update(whiteboard.objects[o]["data"])
					c.sendMessage(json.dumps({
						"type": "create_object",
						"objectID": int(o),
						"layer": whiteboard.objects[o]["layer"],
						"typeID": whiteboard.objects[o]["typeID"],
						"data": objectData
					}))
			return
		# Load JSON message
		messageData = json.loads(message)
		if messageData["action"] == "create_object":
			# === Create object ===
			whiteboard.objects[messageData["objectID"]] = {
				"layer": messageData["layer"],
				"typeID": messageData["typeID"],
				"data": messageData["data"],
				"blob": None
			}
			# Inform other clients
			for otherClient in self.ws_server.clients:
				if self.clientWhiteboards[otherClient.id] == whiteboard:
					otherClient.sendMessage(json.dumps({
						"type": "create_object",
						"objectID": int(messageData["objectID"]),
						"layer": messageData["layer"],
						"typeID": messageData["typeID"],
						"data": messageData["data"]
					}))
			# Save whiteboard
			whiteboard.saveObjectList()
		elif messageData["action"] == "remove_object":
			# === Remove object ===
			o = None
			for checkObj in whiteboard.objects:
				if checkObj == messageData["objectID"]:
					o = checkObj
			if o == None: c.sendMessage(json.dumps({
				"type": "error",
				"data": f"Cannot remove object with ID {messageData['objectID']} as it does not exist"
			}))
			else:
				# Actually remove the object
				whiteboard.objects.pop(o)
				# Inform other clients
				for otherClient in self.ws_server.clients:
					if self.clientWhiteboards[otherClient.id] == whiteboard:
						otherClient.sendMessage(json.dumps({
							"type": "remove_object",
							"objectID": int(messageData["objectID"])
						}))
				# Save whiteboard
				whiteboard.saveObjectList()
		elif messageData["action"] == "edit_object":
			# === Edit object ===
			o = None
			for checkObj in whiteboard.objects:
				if checkObj == messageData["objectID"]:
					o = checkObj
			if o == None: c.sendMessage(json.dumps({
				"type": "error",
				"data": f"Cannot edit object with ID {messageData['objectID']} as it does not exist"
			}))
			else:
				# Update object data
				whiteboard.objects[o]["data"].update(messageData["newData"])
				# Inform other clients
				for otherClient in self.ws_server.clients:
					if self.clientWhiteboards[otherClient.id] == whiteboard:
						otherClient.sendMessage(json.dumps({
							"type": "edit_object",
							"objectID": int(messageData["objectID"]),
							"newData": messageData["newData"],
							"blobModified": False
						}))
				# Save whiteboard
				whiteboard.saveObjectList()
	def on_ws_disconnect(self, c: wslib.Client):
		del self.clientWhiteboards[c.id]

if __name__ == "__main__":
	server = Draw3Server("0.0.0.0", serverPort)
	server.run()
