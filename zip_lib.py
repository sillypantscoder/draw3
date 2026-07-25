from io import BytesIO
import zipfile

class ZipFile(object):
	def __init__(self, items: dict[str, bytes] = {}):
		self.in_memory_zip = BytesIO()
		self.items: dict[str, bytes] = {}
		self.append_multiple(items)
	def append(self, filename_in_zip: str, file_contents: bytes):
		# Record this file.
		self.items[filename_in_zip] = file_contents
		# Get a handle to the in-memory zip in append mode
		zf = zipfile.ZipFile(self.in_memory_zip, "a", zipfile.ZIP_DEFLATED, False)
		# Write the file to the in-memory zip
		zf.writestr(filename_in_zip, file_contents)
		# Mark the files as having been created on Windows
		for zfile in zf.filelist:
			zfile.create_system = 0
		return self
	def append_multiple(self, files: "dict[str, bytes]"):
		# Get a handle to the in-memory zip in append mode
		zf = zipfile.ZipFile(self.in_memory_zip, "a", zipfile.ZIP_DEFLATED, False)
		# Process each file
		for filename_in_zip in files:
			file_contents = files[filename_in_zip]
			self.items[filename_in_zip] = file_contents
			# Write the file to the in-memory zip
			zf.writestr(filename_in_zip, file_contents)
		# Mark the files as having been created on Windows
		for zfile in zf.filelist:
			zfile.create_system = 0
		return self
	def to_bytes(self):
		self.in_memory_zip.seek(0)
		return self.in_memory_zip.read()
	def write_to_file(self, filename: str):
		# Writes the in-memory zip to a physical file.
		with open(filename, "wb") as file:
			file.write(self.to_bytes())
	@staticmethod
	def from_file(filename: str):
		input_zip = zipfile.ZipFile(filename)
		imz = ZipFile({ name: input_zip.read(name) for name in input_zip.namelist() })
		return imz
