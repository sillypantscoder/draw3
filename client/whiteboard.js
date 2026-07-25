// Switch tools
document.querySelector(".menu")?.addEventListener("click", (event) => {
	/** @type {HTMLElement | null} */
	// @ts-ignore
	var menuoption = event.target
	if (menuoption?.classList.contains("menu-option") !== true) return;
	// If we clicked on a menu option:
	if (menuoption != null) {
		// Remove the current selected option.
		document.querySelector('.menu-option-selected')?.classList.remove('menu-option-selected');
		// Add the new selected option.
		menuoption.classList.add("menu-option-selected")
		// Quit button
		if (menuoption.dataset.mode == "Quit") {
			location.assign("/")
			return
		}
	}
	// Set mode output
	var modeOutput = document.querySelector('#mode-output')
	if (modeOutput != null) modeOutput.textContent = getCurrentMode()
	// De-select items
	window.dispatchEvent(new Event("Custom-Switch-Tools"));
	// Draw Mode window
	if (menuoption?.dataset.mode == "Draw") document.querySelector("#drawmode")?.classList.remove("hidden")
	else document.querySelector("#drawmode")?.classList.add("hidden")
}, false)
/** @returns {"Draw" | "Text" | "Move" | "Select" | "Erase"} */
function getCurrentMode() {
	// @ts-ignore
	return document.querySelector(".menu-option-selected").dataset.mode
}
/** @param {string} mode */
function setCurrentMode(mode) {
	var button = document.querySelector(`.menu-option[data-mode="${mode}"]`);
	if (button == null) throw new Error("Not a valid mode")
	if (! (button instanceof HTMLElement)) throw new Error(`Element for mode "${mode}" is not HTML`)
	button.click()
}

(function updateScreenSize() {
	mainCanvas.width = window.innerWidth;
	mainCanvas.height = window.innerHeight;
	window.addEventListener("resize", () => {
		updateScreenSize();
	}, { once: true });
})();

/** @param {Rect[]} rects */
function getBoundingBox(rects) {
	var leftPos = Infinity;
	var topPos = Infinity;
	var rightPos = -Infinity;
	var bottomPos = -Infinity;
	for (var rect of rects) {
		if (rect.x < leftPos) leftPos = rect.x
		if (rect.y < topPos) topPos = rect.y
		if (rect.x + rect.w > rightPos) rightPos = rect.x + rect.w
		if (rect.y + rect.h > bottomPos) bottomPos = rect.y + rect.h
	}
	var width = rightPos - leftPos;
	var height = bottomPos - topPos;
	return { x: leftPos, y: topPos, w: width, h: height }
}

class AbstractSceneObject {
	static typeID = "[ERROR]"
	/**
	 * @param {number} id
	 * @param {number} layer
	 * @param {Object<string, any>} data
	 */
	constructor(id, layer, data) {
		this.objectID = id
		this.layer = layer
		this.data = data
		this._originalData = structuredClone(this.data)
		/** @type {() => Promise<Blob | null>} */
		this.blobGetter = ((_this) => function delayBlobGetter() { return new Promise((resolve) => requestAnimationFrame(() => {
			if (_this.blobGetter.name == "delayBlobGetter") resolve(null);
			else _this.blobGetter().then(resolve)
		}))})(this)
		/** @type {number | null} */
		this.editedTime = null;
		this.verified = false;
	}
	add() {}
	verify() { this.verified = true; }
	unverify() { this.verified = false; }
	reload() {}
	remove() {}
	/**
	 * Creates an object given its type ID, object ID, and data. Does not add the object to the screen.
	 * @param {number} objectID
	 * @param {number} layer
	 * @param {String} typeID
	 * @param {Object<string, any>} data
	 * @param {() => Promise<Blob | null>} blobGetter
	 * @returns {AbstractSceneObject}
	 */
	static createFromDataAndID(objectID, layer, typeID, data, blobGetter) {
		var objClass = objectTypes[typeID]
		var o = new objClass(objectID, layer, data)
		o.blobGetter = blobGetter
		return o
	}
	static generateObjectID() {
		return Math.floor(Math.random() * 10000000)
	}
	/** @returns {string} */
	// @ts-ignore
	getTypeID() { return this.constructor.typeID; }
}
class SceneObject2D extends AbstractSceneObject {
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 * @param {boolean} selected
	 * @param {boolean} onAnotherLayer
	 */
	draw(viewport, canvas, selected, onAnotherLayer) {}
	/**
	 * @param {Viewport} viewport
	 * @returns {Rect}
	 */
	getBoundingRect(viewport) {
		throw new Error()
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Line} line
	 */
	collideline(viewport, line) {
		return true
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} rect
	 */
	colliderect(viewport, rect) {
		return true
	}
	/**
	 * @param {number} dx
	 * @param {number} dy
	 */
	linearMove(dx, dy) {
		this.editedTime = Date.now()
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} boundingBox
	 * @returns {Handle[]}
	 */
	getHandles(viewport, boundingBox) { return []; }
}
class DrawingObject extends SceneObject2D {
	static typeID = "drawing"
	/**
	 * @param {number} id
	 * @param {number} layer
	 * @param {Object<string, any>} data
	 */
	constructor(id, layer, data) {
		super(id, layer, data)
		/** @type {Point[]} */
		this.path = typeof data.d == "string" ? DrawingObject.parsePointList(data.d) : data.d;
		this.color = data.color;
	}
	reload() {
		this.path = typeof this.data.d == "string" ? DrawingObject.parsePointList(this.data.d) : this.data.d;
		this.color = this.data.color;
	}
	/**
	 * @param {string} data
	 * @returns {Point[]}
	 */
	static parsePointList(data) {
		return data.split(";").map((v) => ({ x: Number(v.split(",")[0]), y: Number(v.split(",")[1]) }))
	}
	/**
	 * @param {Point[]} points
	 * @returns {string}
	 */
	static savePointList(points) {
		return points.map((v) => `${v.x},${v.y}`).join(";")
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 * @param {boolean} selected
	 * @param {boolean} onAnotherLayer
	 */
	draw(viewport, canvas, selected, onAnotherLayer) {
		canvas.lineJoin = "round"
		canvas.fillStyle = "none"
		canvas.globalAlpha = (this.verified ? 1 : 0.5) * (onAnotherLayer ? 0.25 : 1)
		if (selected) {
			canvas.strokeStyle = "blue"
			canvas.lineWidth = 8
			// Draw lines
			canvas.beginPath()
			let drawPos = viewport.getScreenPosFromStagePos(this.path[0].x, this.path[0].y); canvas.moveTo(drawPos.x, drawPos.y);
			for (var i = 1; i < this.path.length; i++) {
				let drawPos = viewport.getScreenPosFromStagePos(this.path[i].x, this.path[i].y); canvas.lineTo(drawPos.x, drawPos.y);
			}
			canvas.stroke()
		}
		canvas.strokeStyle = this.color
		canvas.lineWidth = 5
		// Draw lines
		canvas.beginPath()
		let drawPos = viewport.getScreenPosFromStagePos(this.path[0].x, this.path[0].y); canvas.moveTo(drawPos.x, drawPos.y);
		for (var i = 1; i < this.path.length; i++) {
			let drawPos = viewport.getScreenPosFromStagePos(this.path[i].x, this.path[i].y); canvas.lineTo(drawPos.x, drawPos.y);
		}
		canvas.stroke()
	}
	/**
	 * @param {Viewport} viewport
	 * @returns {Rect}
	 */
	getBoundingRect(viewport) {
		let minX = this.path[0].x;
		let minY = this.path[0].y;
		let maxX = this.path[0].x;
		let maxY = this.path[0].y;
		for (let i = 1; i < this.path.length; i++) {
			const pt = this.path[i];
			if (pt.x < minX) minX = pt.x;
			if (pt.y < minY) minY = pt.y;
			if (pt.x > maxX) maxX = pt.x;
			if (pt.y > maxY) maxY = pt.y;
		}
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Line} line
	 */
	collideline(viewport, line) {
		for (var i = 0; i < this.path.length - 1; i++) {
			if (line_intersects_line({ start: this.path[i], end: this.path[i + 1] }, line)) {
				return true
			}
		}
		return false
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} rect
	 */
	colliderect(viewport, rect) {
		var padding = 6 / (1 + (rect.w * rect.h));
		var checkRect = {
			x: rect.x - (padding / viewport.zoom),
			y: rect.y - (padding / viewport.zoom),
			w: rect.w + (2 * padding / viewport.zoom),
			h: rect.h + (2 * padding / viewport.zoom)
		}
		for (var i = 0; i < this.path.length - 1; i++) {
			if (rectangleIntersectsLine(checkRect, { start: this.path[i], end: this.path[i + 1] })) {
				return true
			}
		}
		return false;
	}
	/**
	 * @param {number} dx
	 * @param {number} dy
	 */
	linearMove(dx, dy) {
		for (var pos of this.path) {
			pos.x += dx;
			pos.y += dy;
		}
		this.data.d = DrawingObject.savePointList(this.path)
		super.linearMove(dx, dy);
	}
}
class ShapeObject extends SceneObject2D {
	static typeID = "shape"
	/**
	 * @param {number} id
	 * @param {number} layer
	 * @param {Object<string, any>} data
	 */
	constructor(id, layer, data) {
		super(id, layer, data)
		/** @type {string} */
		this.shapeID = data.shape;
		/** @type {Point} */
		this.start = data.start;
		/** @type {Point} */
		this.end = data.end;
		this.color = data.color;
	}
	reload() {
		this.shapeID = this.data.shape;
		this.start = this.data.start;
		this.end = this.data.end;
		this.color = this.data.color;
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 * @param {boolean} selected
	 * @param {boolean} onAnotherLayer
	 */
	draw(viewport, canvas, selected, onAnotherLayer) {
		var path = drawingModes.filter((v) => v.type == "shape").filter((v) => v.shapeID == this.shapeID)[0].makeShape(this.start, this.end)
		canvas.lineJoin = "round"
		canvas.fillStyle = "none"
		canvas.globalAlpha = (this.verified ? 1 : 0.5) * (onAnotherLayer ? 0.25 : 1)
		if (selected) {
			canvas.strokeStyle = "blue"
			canvas.lineWidth = 8
			// Draw lines
			canvas.beginPath()
			let drawPos = viewport.getScreenPosFromStagePos(path[0].x, path[0].y); canvas.moveTo(drawPos.x, drawPos.y);
			for (var i = 1; i < path.length; i++) {
				let drawPos = viewport.getScreenPosFromStagePos(path[i].x, path[i].y); canvas.lineTo(drawPos.x, drawPos.y);
			}
			canvas.stroke()
		}
		canvas.strokeStyle = this.color
		canvas.lineWidth = 5
		// Draw lines
		canvas.beginPath()
		let drawPos = viewport.getScreenPosFromStagePos(path[0].x, path[0].y); canvas.moveTo(drawPos.x, drawPos.y);
		for (var i = 1; i < path.length; i++) {
			let drawPos = viewport.getScreenPosFromStagePos(path[i].x, path[i].y); canvas.lineTo(drawPos.x, drawPos.y);
		}
		canvas.stroke()
	}
	/**
	 * @param {Viewport} viewport
	 * @returns {Rect}
	 */
	getBoundingRect(viewport) {
		var path = drawingModes.filter((v) => v.type == "shape").filter((v) => v.shapeID == this.shapeID)[0].makeShape(this.start, this.end)
		let minX = path[0].x;
		let minY = path[0].y;
		let maxX = path[0].x;
		let maxY = path[0].y;
		for (let i = 1; i < path.length; i++) {
			const pt = path[i];
			if (pt.x < minX) minX = pt.x;
			if (pt.y < minY) minY = pt.y;
			if (pt.x > maxX) maxX = pt.x;
			if (pt.y > maxY) maxY = pt.y;
		}
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Line} line
	 */
	collideline(viewport, line) {
		var path = drawingModes.filter((v) => v.type == "shape").filter((v) => v.shapeID == this.shapeID)[0].makeShape(this.start, this.end)
		for (var i = 0; i < path.length - 1; i++) {
			if (line_intersects_line({ start: path[i], end: path[i + 1] }, line)) {
				return true
			}
		}
		return false
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} rect
	 */
	colliderect(viewport, rect) {
		var path = drawingModes.filter((v) => v.type == "shape").filter((v) => v.shapeID == this.shapeID)[0].makeShape(this.start, this.end)
		var padding = 6 / (1 + (rect.w * rect.h));
		var checkRect = {
			x: rect.x - (padding / viewport.zoom),
			y: rect.y - (padding / viewport.zoom),
			w: rect.w + (2 * padding / viewport.zoom),
			h: rect.h + (2 * padding / viewport.zoom)
		}
		for (var i = 0; i < path.length - 1; i++) {
			if (rectangleIntersectsLine(checkRect, { start: path[i], end: path[i + 1] })) {
				return true
			}
		}
		return false;
	}
	/**
	 * @param {number} dx
	 * @param {number} dy
	 */
	linearMove(dx, dy) {
		this.start.x += dx
		this.start.y += dy
		this.data.start = this.start
		this.end.x += dx
		this.end.y += dy
		this.data.end = this.end
		super.linearMove(dx, dy);
	}
}
class TextObject extends SceneObject2D {
	static typeID = "text"
	/**
	 * @param {number} id
	 * @param {number} layer
	 * @param {Object<string, any>} data
	 */
	constructor(id, layer, data) {
		super(id, layer, data)
		/** @type {Point} */
		this.pos = data.pos
		/** @type {number} */
		this.scale = data.scale
		/** @type {number} */
		this.width = data.width
		/** @type {string} */
		this.text = data.text
	}
	add() {
		super.add()
	}
	verify() {
		super.verify()
	}
	unverify() {
		super.unverify()
	}
	reload() {
		this.pos = this.data.pos
		this.width = Number(this.data.width);
		this.editedTime = null
	}
	getVisualLayout() {
		// Measure text
		var canvas = new OffscreenCanvas(1, 1).getContext('2d') ?? (() => {
			throw new Error("context is missing");
		})();
		var texts = this.text.split("\n").map((v) => {
			canvas.font = `16px sans-serif`
			var metrics = canvas.measureText(v)
			return {
				text: v,
				width: metrics.width,
				baseline: metrics.fontBoundingBoxAscent,
				height: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent
			}
		})
		// Create layout
		const padding = 5;
		var totalTextHeight = texts.reduce((a, b) => a + b.height, 0)
		return {
			boundingBox: {
				x: this.pos.x,
				y: this.pos.y,
				w: this.width * this.scale,
				h: (padding + totalTextHeight + padding) * this.scale
			},
			textElements: texts.map((v, i, l) => {
				var previousElementHeight = l.slice(0, i).reduce((a, b) => a + b.height, 0)
				var offsetHeight = (padding + previousElementHeight + v.baseline) * this.scale
				return {
					text: v.text,
					x: this.pos.x + (padding * this.scale),
					y: this.pos.y + offsetHeight
				}
			})
		}
	}
	/**
	 * @param {Viewport} viewport
	 */
	createTextAreaElement(viewport) {
		var e = (() => {
			var t = document.createElementNS("http://www.w3.org/1999/xhtml", "textarea")
			if (! (t instanceof HTMLTextAreaElement)) {
				throw new Error("newly created element is of the wrong type!!! (This error is definitely not possible)")
			}
			return t
		})();
		const updateBoxSize = () => {
			// Set text box pos and width
			e.setAttribute("style", `top: ${(this.pos.y * viewport.zoom) + viewport.y}px; left: ${(this.pos.x * viewport.zoom) + viewport.x}px; \
width: ${this.width * this.scale * viewport.zoom}px; font-size: ${16 * this.scale * viewport.zoom}px; padding: ${5 * this.scale * viewport.zoom}px; line-height: 1em;`)
			// Set height
			e.style.height = "0px";
			e.style.height = `calc(${e.scrollHeight}px + ${0.25 * this.scale * viewport.zoom}em)`
		}
		// Add event listeners
		e.addEventListener("click", (event) => {
			event.stopPropagation()
		}, false)
		e.addEventListener("mousedown", (event) => {
			event.stopPropagation()
		}, false)
		e.addEventListener("touchstart", (event) => {
			event.stopPropagation()
		}, false)
		e.addEventListener("input", () => {
			// Save new text
			this.text = e.value
			this.data.text = this.text
			if (this.editedTime == null) this.editedTime = Date.now()
			// Update textbox size
			updateBoxSize();
		})
		e.addEventListener("blur", () => {
			e.dispatchEvent(new KeyboardEvent("input"));
			e.remove();
		})
		// Set textarea initial value
		e.value = this.text
		requestAnimationFrame(() => {
			updateBoxSize();
		})
		return e
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 * @param {boolean} selected
	 * @param {boolean} onAnotherLayer
	 */
	draw(viewport, canvas, selected, onAnotherLayer) {
		var layout = this.getVisualLayout();
		// Draw outline
		canvas.globalAlpha = (this.verified ? 1 : 0.5) * (onAnotherLayer ? 0.25 : 1)
		canvas.strokeStyle = "black"
		canvas.lineJoin = "miter"
		canvas.lineWidth = 2
		var originPos = viewport.getScreenPosFromStagePos(layout.boundingBox.x, layout.boundingBox.y)
		canvas.strokeRect(originPos.x, originPos.y, layout.boundingBox.w * viewport.zoom, layout.boundingBox.h * viewport.zoom)
		// Draw text
		canvas.fillStyle = "black"
		for (var textElement of layout.textElements) {
			canvas.font = `${viewport.zoom * this.scale * 16}px sans-serif`
			var pos = viewport.getScreenPosFromStagePos(textElement.x, textElement.y)
			canvas.fillText(textElement.text, pos.x, pos.y)
		}
	}
	remove() {
		super.remove()
	}
	/**
	 * @param {Viewport} viewport
	 * @returns {Rect}
	 */
	getBoundingRect(viewport) {
		return this.getVisualLayout().boundingBox;
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Line} line
	 */
	collideline(viewport, line) {
		return rectangleIntersectsLine(this.getVisualLayout().boundingBox, line)
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} rect
	 */
	colliderect(viewport, rect) {
		var stageRect = this.getVisualLayout().boundingBox
		return rect.x <= stageRect.x + stageRect.w && rect.x + rect.w >= stageRect.x && rect.y <= stageRect.y + stageRect.h && rect.y + rect.h >= stageRect.y
	}
	/**
	 * @param {number} dx
	 * @param {number} dy
	 */
	linearMove(dx, dy) {
		this.pos.x += dx;
		this.pos.y += dy;
		this.data.pos = this.pos
		super.linearMove(dx, dy);
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} boundingBox
	 * @returns {Handle[]}
	 */
	getHandles(viewport, boundingBox) { return [new TextBoxWidthHandle(viewport, this, boundingBox), new RescalingHandle(viewport, this, boundingBox)]; }
}
class ImageObject extends SceneObject2D {
	static typeID = "image"
	/**
	 * @param {number} id
	 * @param {number} layer
	 * @param {Object<string, any>} data
	 */
	constructor(id, layer, data) {
		super(id, layer, data)
		/** @type {Point} */
		this.pos = { x: data.x, y: data.y }
		/** @type {number} */
		this.scale = data.scale
		/** @type {ImageBitmap | null} */
		this.loadedImage = null
		// TODO: Create test image to avoid all this null nonsense
		this.reload()
	}
	reload() {
		this.pos = { x: this.data.x, y: this.data.y }
		this.scale = this.data.scale
		// Load Image
		this.blobGetter().then(async (blob) => {
			if (blob == null) {
				throw Error(`Image with ID ${this.objectID} is missing an image!`)
			}
			// What is an ImageBitmap
			var bitmap = await createImageBitmap(blob);
			// Save!
			this.loadedImage = bitmap;
		})
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 * @param {boolean} selected
	 * @param {boolean} onAnotherLayer
	 */
	draw(viewport, canvas, selected, onAnotherLayer) {
		// Find position
		var imagePos = viewport.getScreenPosFromStagePos(this.pos.x, this.pos.y)
		var width = (this.loadedImage?.width ?? 50) * this.scale * viewport.zoom
		var height = (this.loadedImage?.height ?? 50) * this.scale * viewport.zoom
		// Draw image onto canvas
		if (this.loadedImage != null) {
			// Draw image
			canvas.globalAlpha = (this.verified ? 1 : 0.5) * (onAnotherLayer ? 0.25 : 1)
			canvas.drawImage(this.loadedImage, imagePos.x, imagePos.y, width, height)
			// TODO: Cache resized images!
		} else {
			// fallback :(
			canvas.fillStyle = "black"
			canvas.strokeStyle = "none"
			canvas.globalAlpha = 0.5 * (this.verified ? 1 : 0.5) * (onAnotherLayer ? 0.25 : 1)
			canvas.fillRect(imagePos.x, imagePos.y, width, height)
		}
	}
	/**
	 * @param {Viewport} viewport
	 * @returns {Rect}
	 */
	getBoundingRect(viewport) {
		return {
			x: this.pos.x,
			y: this.pos.y,
			w: (this.loadedImage?.width ?? 50) * this.scale,
			h: (this.loadedImage?.height ?? 50) * this.scale
		}
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Line} line
	 */
	collideline(viewport, line) {
		var stageSize = { x: (this.loadedImage?.width ?? 50) * this.scale, y: (this.loadedImage?.height ?? 50) * this.scale }
		return rectangleIntersectsLine({ x: this.pos.x, y: this.pos.y, w: stageSize.x, h: stageSize.y }, line)
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} rect
	 */
	colliderect(viewport, rect) {
		var stageSize = { x: (this.loadedImage?.width ?? 50) * this.scale, y: (this.loadedImage?.height ?? 50) * this.scale }
		// stagePos = this.pos
		return rect.x <= this.pos.x + stageSize.x && rect.x + rect.w >= this.pos.x && rect.y <= this.pos.y + stageSize.y && rect.y + rect.h >= this.pos.y
	}
	/**
	 * @param {number} dx
	 * @param {number} dy
	 */
	linearMove(dx, dy) {
		this.pos.x += dx;
		this.pos.y += dy;
		this.data.x = this.pos.x
		this.data.y = this.pos.y
		super.linearMove(dx, dy);
	}
	/**
	 * @param {Viewport} viewport
	 * @param {Rect} boundingBox
	 * @returns {Handle[]}
	 */
	getHandles(viewport, boundingBox) { return [new RescalingHandle(viewport, this, boundingBox)]; }
}

/** @type {Object<string, typeof AbstractSceneObject>} */
const objectTypes = (() => {
	/** @type {Object<string, typeof AbstractSceneObject>} */
	var objectTypes = {};
	for (var cls of [
		DrawingObject,
		ShapeObject,
		TextObject,
		ImageObject
	]) {
		objectTypes[cls.typeID] = cls;
	}
	return objectTypes;
})();

class Handle {
	/** @param {Viewport} viewport */
	constructor(viewport) {
		this.viewport = viewport
		this.pos = { x: 0, y: 0 }
		this.isDragging = false;
	}
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	moveTo(x, y) {
		this.pos.x = x
		this.pos.y = y
	}
	finishMovement() {
		this.isDragging = false;
	}
}
class LinearMovementHandle extends Handle {
	/**
	 * @param {Viewport} viewport
	 * @param {{ objects: SceneObject2D[], boundingBox: Rect, handles: Handle[] }} selection
	 */
	constructor(viewport, selection) {
		super(viewport)
		this.selection = selection
		// Find handle position
		this.pos.x = this.selection.boundingBox.x;
		this.pos.y = this.selection.boundingBox.y;
	}
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	moveTo(x, y) {
		var dx = x - this.pos.x
		var dy = y - this.pos.y
		this.pos.x = x
		this.pos.y = y
		// Move rect
		this.selection.boundingBox.x += dx;
		this.selection.boundingBox.y += dy;
		// Move objects
		for (var o of this.selection.objects) {
			o.linearMove(dx, dy)
		}
	}
}
class TextBoxWidthHandle extends Handle {
	/**
	 * @param {Viewport} viewport
	 * @param {TextObject} selection
	 * @param {Rect} boundingBox
	 */
	constructor(viewport, selection, boundingBox) {
		super(viewport)
		this.selection = selection
		this.rect = boundingBox;
		// Find handle position
		this.pos.x = this.rect.x + this.rect.w;
		this.pos.y = this.rect.y;
	}
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	moveTo(x, y) {
		this.pos.x = Math.max(x, this.rect.x + 30);
		// Move object
		this.selection.width = (this.pos.x - this.rect.x) / this.selection.scale;
		this.selection.data.width = this.selection.width;
		// Move rect
		this.rect.w = this.selection.width * this.selection.scale;
		this.rect.h = this.selection.getVisualLayout().boundingBox.h;
	}
}
class RescalingHandle extends Handle {
	/**
	 * @param {Viewport} viewport
	 * @param {TextObject | ImageObject} selection
	 * @param {Rect} boundingBox
	 */
	constructor(viewport, selection, boundingBox) {
		super(viewport)
		this.selection = selection
		this.rect = boundingBox;
		// Find handle position
		this.pos.x = this.rect.x + this.rect.w;
		this.pos.y = this.rect.y + this.rect.h;
	}
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	moveTo(x, y) {
		this.pos.x = Math.max(x, this.rect.x + 5);
		var scaleFactor = (x - this.rect.x) / this.rect.w;
		this.pos.y = this.rect.y + (scaleFactor * (this.pos.y - this.rect.y))
		// Move object
		this.selection.scale *= scaleFactor;
		this.selection.data.scale = this.selection.scale;
		if (this.selection instanceof TextObject) {
			// Move rect
			this.rect.w = this.selection.width * this.selection.scale;
			this.rect.h = this.selection.getVisualLayout().boundingBox.h;
		} else {
			this.selection.editedTime = Date.now()
			// Move rect
			this.rect.w = (this.selection.loadedImage?.width ?? 50) * this.selection.scale;
			this.rect.h = (this.selection.loadedImage?.height ?? 50) * this.selection.scale;
		}
	}
}

class Viewport {
	constructor() {
		this.x = 0;
		this.y = 0;
		this.zoom = 1;
	}
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	getStagePosFromScreenPos(x, y) {
		var realPos = { x: (x - this.x) / this.zoom, y: (y - this.y) / this.zoom }
		return realPos
	}
	/**
	 * @param {number} x
	 * @param {number} y
	 */
	getScreenPosFromStagePos(x, y) {
		var realPos = { x: (x * this.zoom) + this.x, y: (y * this.zoom) + this.y }
		return realPos
	}
	/**
	 * @param {Point} origin
	 * @param {number} amount
	 */
	zoomView(origin, amount) {
		this.x += ((this.x - origin.x) * amount) + (origin.x - this.x)
		this.y += ((this.y - origin.y) * amount) + (origin.y - this.y)
		this.zoom *= amount
	}
}
class Renderer2D {
	/** @param {Whiteboard2D} whiteboard */
	constructor(whiteboard) {
		this.whiteboard = whiteboard;
		this.loopID = 0;
	}
	render() {
		var screenTopLeft = this.whiteboard.viewport.getStagePosFromScreenPos(0, 0)
		var screenBottomRight = this.whiteboard.viewport.getStagePosFromScreenPos(window.innerWidth, window.innerHeight)
		var screenRect = {
			x: screenTopLeft.x,
			y: screenTopLeft.y,
			w: screenBottomRight.x - screenTopLeft.x,
			h: screenBottomRight.y - screenTopLeft.y
		}
		mainCanvasCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height)
		mainCanvasCtx.lineCap = "round"
		mainCanvasCtx.lineJoin = "round"
		for (var i = 0; i < this.whiteboard.objects.length; i++) {
			var obj = this.whiteboard.objects[i];
			if (obj.colliderect(this.whiteboard.viewport, screenRect)) {
				obj.draw(this.whiteboard.viewport, mainCanvasCtx, this.whiteboard.selection?.objects.includes(obj) ?? false, this.whiteboard.strictLayer && this.whiteboard.selectedLayer != obj.layer)
			}
		}
		// Render selection
		if (this.whiteboard.selection != null) {
			// Render original border
			{
				let borderPos = this.whiteboard.viewport.getScreenPosFromStagePos(this.whiteboard.selection.originalBoundingBox.x, this.whiteboard.selection.originalBoundingBox.y);
				let borderWidth = this.whiteboard.selection.originalBoundingBox.w * this.whiteboard.viewport.zoom;
				let borderHeight = this.whiteboard.selection.originalBoundingBox.h * this.whiteboard.viewport.zoom;
				// Format
				mainCanvasCtx.strokeStyle = "black"
				mainCanvasCtx.lineWidth = 1
				mainCanvasCtx.globalAlpha = 0.5
				// Draw
				mainCanvasCtx.strokeRect(borderPos.x, borderPos.y, borderWidth, borderHeight)
			}
			// Render border
			{
				let borderPos = this.whiteboard.viewport.getScreenPosFromStagePos(this.whiteboard.selection.boundingBox.x, this.whiteboard.selection.boundingBox.y);
				let borderWidth = this.whiteboard.selection.boundingBox.w * this.whiteboard.viewport.zoom;
				let borderHeight = this.whiteboard.selection.boundingBox.h * this.whiteboard.viewport.zoom;
				// Format
				mainCanvasCtx.strokeStyle = "#008"
				mainCanvasCtx.lineWidth = 1.5
				mainCanvasCtx.globalAlpha = 1
				// Draw
				mainCanvasCtx.strokeRect(borderPos.x, borderPos.y, borderWidth, borderHeight)
			}
			// Render handles
			for (var handle of this.whiteboard.selection.handles) {
				var screenPos = this.whiteboard.viewport.getScreenPosFromStagePos(handle.pos.x, handle.pos.y)
				// Format circle
				mainCanvasCtx.fillStyle = handle.isDragging ? "#008" : "white"
				mainCanvasCtx.lineWidth = 3
				// Draw circle
				mainCanvasCtx.beginPath();
				mainCanvasCtx.arc(screenPos.x, screenPos.y, 10, 0, Math.PI * 2);
				mainCanvasCtx.fill();
				mainCanvasCtx.stroke();
			}
		}
		// Render touches
		for (var i = 0; i < this.whiteboard.touchHandler.touches.length; i++) {
			var touch = this.whiteboard.touchHandler.touches[i];
			touch.mode.render(this.whiteboard.viewport, mainCanvasCtx)
		}
	}
	checkForEditedObjects() {
		/** @type {{ objectID: number, previousData: Object, data: Object }[]} */
		var objectEdits = []
		for (var i = 0; i < this.whiteboard.objects.length; i++) {
			var obj = this.whiteboard.objects[i];
			// Is edited?
			if (obj.editedTime == null) continue;
			var timeDelta = Date.now() - obj.editedTime;
			if (timeDelta > 500) {
				objectEdits.push({
					objectID: obj.objectID,
					previousData: obj._originalData,
					data: obj.data
				})
				// Reset object
				obj.editedTime = null
				obj._originalData = structuredClone(obj.data)
			}
		}
		if (objectEdits.length > 0) {
			this.whiteboard.doAction(new USIEditObjects(this.whiteboard, objectEdits))
			this.whiteboard.updateSelection()
		}
	}
	async renderLoop() {
		while (true) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
			this.render()
			this.checkForEditedObjects()
		}
	}
}
class Connection {
	/**
	 * @param {AbstractWhiteboard<?, ?>} whiteboard
	 * @param {boolean} first
	 */
	constructor(whiteboard, first) {
		this.whiteboard = whiteboard;
		this.nPostRequestsInProgress = 0;
		// Create websocket
		var ws = new WebSocket("wss://" + location.hostname + "/ws")
		this.webSocket = ws
		ws.addEventListener("open", () => {
			ws.send((first ? "1" : "0") + (location.pathname.split("/").at(-2) ?? "ERROR"))
			document.querySelector("#lost-connection-menu")?.classList.add("hidden")
		})
		ws.addEventListener("close", () => {
			document.querySelector("#lost-connection-menu")?.classList.remove("hidden")
		})
		ws.addEventListener("message", this.onmessage.bind(this))
	}
	/**
	 * @param {MessageEvent<string>} msgEvent
	 */
	onmessage(msgEvent) {
		/** @type {{ type: "error", data: string } | { type: "create_object", objectID: number, layer: number, typeID: string, data: Object } | { type: "remove_object", objectID: number } | { type: "edit_object", objectID: number, newData: Object, blobModified: boolean }} */
		var message = JSON.parse(msgEvent.data)
		if (message.type == "error") {
			console.error("[Server]", message.data)
		} else if (message.type == "create_object") {
			// Search for existing object
			var objectID = message.objectID
			var obj = this.whiteboard.findObjectSafe(objectID)
			// Create new object?
			if (obj == undefined) {
				obj = AbstractSceneObject.createFromDataAndID(objectID, message.layer, message.typeID, message.data, this.whiteboard.getBlob.bind(this.whiteboard, objectID))
				this.whiteboard.add(obj)
			}
			// Verify object!
			obj.verify()
		} else if (message.type == "remove_object") {
			// Find object
			var obj = this.whiteboard.findObjectSafe(message.objectID)
			// Remove
			if (obj == undefined) {
				console.error("Can't remove nonexistent object with ID:", message.objectID)
			} else {
				this.whiteboard.remove(obj);
			}
		} else if (message.type == "edit_object") {
			// Find object
			var obj = this.whiteboard.findObjectSafe(message.objectID)
			// Remove
			if (obj == undefined) {
				console.error("Can't edit nonexistent object with ID:", message.objectID)
			} else {
				obj.data = message.newData
				obj.reload()
			}
			// Refresh blobs
			if (message.blobModified) this.whiteboard.blobs.delete(message.objectID)
		} else {
			console.error("Got mysterious message from server:", message)
		}
	}
	/**
	 * @param {number} objectID
	 * @param {number} layer
	 * @param {string} typeID
	 * @param {Object} data
	 * @param {Blob | null} blob
	 */
	createObject(objectID, layer, typeID, data, blob) {
		this.webSocket.send(JSON.stringify({
			action: "create_object",
			objectID,
			layer,
			typeID,
			data
		}))
		if (blob != null) {
			this.nPostRequestsInProgress += 1;
			var x = new XMLHttpRequest()
			x.open("POST", "/set_blob?whiteboard=" + location.pathname.split("/").at(-2) + "&objectID=" + objectID)
			x.send(blob)
			x.addEventListener("loadend", () => this.nPostRequestsInProgress -= 1)
		}
	}
	/**
	 * @param {Blob} imageDataBlob
	 * @param {number} index The number of times this function has been called before. Used to space out images.
	 */
	async createImage(imageDataBlob, index) {
		// Load image from blob
		var image = await createImageBitmap(imageDataBlob);
		// Resize image
		var newSize = aspect_scale({ x: image.width, y: image.height }, { x: 1000, y: 1000 }, false);
		var canvas = new OffscreenCanvas(newSize.x, newSize.y);
		canvas.getContext('2d')?.drawImage(image, 0, 0, newSize.x, newSize.y);
		// Convert back to blob
		imageDataBlob = await canvas.convertToBlob({ type: "image/webp", quality: 0.75 });
		// Create image
		this.createObject(AbstractSceneObject.generateObjectID(), this.whiteboard.selectedLayer, "image", {
			x: (50 - this.whiteboard.viewport.x) / this.whiteboard.viewport.zoom,
			y: (50 - (this.whiteboard.viewport.y + (index * -50))) / this.whiteboard.viewport.zoom,
			scale: 1 / this.whiteboard.viewport.zoom
		}, imageDataBlob)
	}
	/**
	 * @param {number} objectID
	 */
	removeObject(objectID) {
		this.webSocket.send(JSON.stringify({
			action: "remove_object",
			objectID
		}))
	}
	/**
	 * @param {number} objectID
	 * @param {Object} newData
	 */
	editObject(objectID, newData) {
		this.webSocket.send(JSON.stringify({
			action: "edit_object",
			objectID,
			newData
		}))
	}
}
/**
 * @template {{ getStagePosFromScreenPos: (x: number, y: number) => Point }} ViewportType
 * @template {AbstractSceneObject} ObjectType
 */
class AbstractWhiteboard {
	/**
	 * @param {ViewportType} viewport
	 */
	constructor(viewport) {
		this.viewport = viewport
		/** @type {ObjectType[]} */
		this.objects = []
		/** @type {Map<number, Blob | null>} */
		this.blobs = new Map()
		this.selectedLayer = 0;
		this.strictLayer = true;
		this.connection = new Connection(this, true)
		// Undo stack objects
		this.shiftKeyDown = false
		/** @type {UndoStackItem[]} */
		this.undo_stack = []
		/** @type {UndoStackItem[]} */
		this.redo_stack = []
		this.addEventListeners()
		// Touch handlers
		this.touchHandler = new TouchHandler(this)
		this.touchHandler.addEventListeners()
	}
	addEventListeners() {
		window.addEventListener("keydown", (e) => {
			this.shiftKeyDown = e.shiftKey
			if (document.activeElement instanceof HTMLTextAreaElement) {
				// Shortcut keys while editing a text box:
				var focusedElement = document.activeElement
				if (e.key == "Escape") {
					// Un-focus textarea
					focusedElement.blur();
				}
				e.stopPropagation()
			}
		}, { capture: true })
		window.addEventListener("keydown", (e) => {
			// Layer shortcuts
			if (e.key == "ArrowLeft") this.updateLayer(-1, true)
			if (e.key == "ArrowRight") this.updateLayer(1, true)
			// Undo/redo
			if (e.ctrlKey) {
				if (e.key == "z") this.undo()
				if (e.key == "Z") this.redo()
				if (e.key == "y") this.redo()
				if (e.key == "Y") this.undo()
			}
		})
		window.addEventListener("keyup", ((/** @type {KeyboardEvent} */ e) => {
			if (e.key == "Shift") this.shiftKeyDown = false
		}).bind(this))
		window.addEventListener("paste", ((/** @type {ClipboardEvent} */ e) => {
			if (e.clipboardData != null) {
				this.loadInsertedContent([...e.clipboardData.items]);
			}
		}).bind(this))
		document.body.addEventListener("dragover", (e) => {
			// Make body into a drop target
			e.preventDefault();
		});
		document.body.addEventListener("drop", (e) => {
			e.preventDefault();
			if (e.dataTransfer != null) {
				this.loadInsertedContent([...e.dataTransfer.items]);
			}
		});
		this.updateUndoButtons()
	}
	attemptPaste() {
		navigator.clipboard.read().then(this.loadInsertedContent.bind(this))
	}
	/** @param {(ClipboardItem | DataTransferItem)[]} content */
	async loadInsertedContent(content) {
		// Create info message
		{
			let e = document.body.appendChild(document.createElement("div"))
			let styles = `position: absolute; bottom: 12em; left: 0; margin: 1em; border: 0.25em solid black; background: #F00; padding: 1em; border-radius: 1em; font-weight: bold; color: white; transition: opacity 2s linear, transform 0.125s ease-in-out;`
			e.setAttribute("style", styles + " opacity: 1; transform: scale(0.9);")
			e.innerText = content.length > 0 ? `Failed to insert ${content.length} item${content.length == 1 ? "" : "s"} as this whiteboard does not support importing content.` : "There is nothing copied to the clipboard!"
			// Finish zoom out
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					e.setAttribute("style", styles + " opacity: 1; transform: scale(1);")
				})
			})
			// Start fading
			setTimeout(() => {
				e.setAttribute("style", styles + " opacity: 0;")
			}, 1000)
			// Finish fading
			setTimeout(() => {
				e.remove()
			}, 3000)
		}
	}
	/** @param {ObjectType} obj */
	add(obj) {
		this.objects.push(obj)
		obj.add()
	}
	/** @param {ObjectType} obj */
	remove(obj) {
		this.objects.splice(this.objects.indexOf(obj), 1)
		obj.remove()
	}
	/** @param {number} objectID */
	findObject(objectID) {
		for (var o of this.objects) {
			if (o.objectID == objectID) {
				return o;
			}
		}
		throw new Error("Object not found with ID: " + objectID)
	}
	/** @param {number} objectID */
	findObjectSafe(objectID) {
		for (var o of this.objects) {
			if (o.objectID == objectID) {
				return o;
			}
		}
		return undefined;
	}
	/**
	 * @param {number} objectID
	 * @returns {Promise<Blob | null>}
	 */
	async getBlob(objectID) {
		var blob = this.blobs.get(objectID)
		if (blob === undefined) {
			while (this.connection.nPostRequestsInProgress > 0) await new Promise((resolve) => requestAnimationFrame(resolve))
			blob = await new Promise((/** @type {(value: Blob | null) => void} */ resolve) => {
				var x = new XMLHttpRequest()
				x.open("GET", "/whiteboard_data/get_blob?whiteboard=" + location.pathname.split("/").at(-2) + "&objectID=" + objectID)
				x.responseType = "blob"
				x.addEventListener("loadend", () => {
					/** @type {Blob} */
					var blob = x.response;
					if (blob.size == 0) resolve(null);
					else resolve(blob);
				})
				x.send(blob)
			})
			this.blobs.set(objectID, blob)
		}
		return blob
	}
	/**
	 * @param {any} amount
	 * @param {boolean} addAndUpdate
	 */
	updateLayer(amount, addAndUpdate) {
		var amountFixed = Math.round(Number(amount))
		if (addAndUpdate) amountFixed += this.selectedLayer
		this.selectedLayer = Math.max(Math.min(amountFixed, 9), -1);
		// Update display
		var layerDisplay = document.querySelector("#layer-display")
		if (addAndUpdate && layerDisplay instanceof HTMLInputElement) layerDisplay.valueAsNumber = whiteboard.selectedLayer;
	}
	/**
	 * @param {UndoStackItem} item
	 */
	doAction(item) {
		item.do()
		this.undo_stack.push(item.invert())
		this.redo_stack = []
		this.updateUndoButtons()
	}
	undo() {
		// Get item
		var item = this.undo_stack.pop()
		if (item == undefined) return
		// Undo
		item.do()
		// Add to redo stack
		this.redo_stack.push(item.invert())
		// Update
		this.updateUndoButtons()
	}
	redo() {
		// Get item
		var item = this.redo_stack.pop()
		if (item == undefined) return
		// Redo
		item.do()
		// Add back to undo stack
		this.undo_stack.push(item.invert())
		// Update
		this.updateUndoButtons()
	}
	updateUndoButtons() {
		// Undo Button
		var u = document.querySelector("button[onclick='whiteboard.undo()']")
		if (u == null) throw new Error("The undo button doesn't exist")
		if (this.undo_stack.length == 0) u.setAttribute("disabled", "true")
		else u.removeAttribute("disabled")
		// Redo Button
		var r = document.querySelector("button[onclick='whiteboard.redo()']")
		if (r == null) throw new Error("The redo button doesn't exist")
		if (this.redo_stack.length == 0) r.setAttribute("disabled", "true")
		else r.removeAttribute("disabled")
	}
	/**
	 * @param {TrackedTouch<AbstractWhiteboard<ViewportType, ObjectType>>} touch
	 * @param {boolean} isEraserButton
	 * @returns {TouchMode<AbstractWhiteboard<ViewportType, ObjectType>>}
	 */
	getTouchMode(touch, isEraserButton) {
		throw new Error("`AbstractWhiteboard` is an abstract class; `getTouchMode` must be overridden")
	}
}
/**
 * @extends {AbstractWhiteboard<Viewport, SceneObject2D>}
 */
class Whiteboard2D extends AbstractWhiteboard {
	constructor() {
		super(new Viewport())
		this.renderer = new Renderer2D(this)
		/** @type {{ objects: SceneObject2D[], originalBoundingBox: Rect, boundingBox: Rect, handles: Handle[] } | null} */
		this.selection = null
	}
	addEventListeners() {
		super.addEventListeners();
		window.addEventListener("keydown", (e) => {
			// Generic shortcut keys:
			if (e.key == "Escape") {
				// Remove selection
				this.selection = null;
				this.updateSelection();
			}
			if (this.selection != null && (e.key == "Backspace" || e.key == "Delete" || e.key == "a")) {
				// Delete selection
				this.doAction(new USIEraseObjects(this, this.selection.objects.map((v) => ({
					layer: this.selectedLayer, typeID: v.getTypeID(), objectID: v.objectID, data: v.data, blob: this.blobs.get(v.objectID) ?? null
				}))));
				this.selection = null;
				this.updateSelection();
				// Erase shortcut (from Select) leads to Draw
				if (e.key == "a") setCurrentMode("Draw")
			} else if (e.key == "a") setCurrentMode("Erase")
			// Mode shortcuts
			if (e.key == "q") setCurrentMode("Move")
			if (e.key == "w") setCurrentMode("Draw")
			if (e.key == "s") setCurrentMode("Select")
			if (e.key == "x") setCurrentMode("Text")
		})
		window.addEventListener("Custom-Switch-Tools", (() => {
			this.selection = null
			this.updateSelection()
		}).bind(this))
	}
	/** @param {(ClipboardItem | DataTransferItem)[]} content */
	async loadInsertedContent(content) {
		var fails = 0
		var successes = 0
		for (var obj of content) {
			// Evaluate this content to see if it can be inserted
			if (obj instanceof DataTransferItem) {
				// If it's a DataTransferItem:
				if (obj.kind == "file" && obj.type.startsWith("image/")) {
						var file = obj.getAsFile()
						if (file) this.connection.createImage(file, successes)
						successes += 1;
				} else fails += 1;
			}
			if (obj instanceof ClipboardItem) {
				// If it's a ClipboardItem:
				for (var mimeType of obj.types) {
					if (mimeType.startsWith("image/")) {
						var blob = await obj.getType(mimeType)
						this.connection.createImage(blob, successes)
						successes += 1;
					} else fails += 1;
				}
			}
		}
		// Create info message
		{
			let e = document.body.appendChild(document.createElement("div"))
			let styles = `position: absolute; bottom: 12em; left: 0; margin: 1em; border: 0.25em solid black; background: ${successes == 0 ? "#F00" : "#080"}; padding: 1em; border-radius: 1em; font-weight: bold; color: white; transition: opacity 2s linear, transform 0.125s ease-in-out;`
			e.setAttribute("style", styles + " opacity: 1; transform: scale(0.9);")
			e.innerText = `${fails > 0 ? `Failed to insert ${fails} non-image item${fails == 1 ? "" : "s"}.` : ""}${fails > 0 && successes > 0 ? " " : ""}${successes > 0 ? `Inserting ${successes} image${successes == 1 ? "" : "s"}...` : ""}`
			if (fails == 0 && successes == 0) e.innerText = `There is nothing copied to the clipboard!`
			// Finish zoom out
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					e.setAttribute("style", styles + " opacity: 1; transform: scale(1);")
				})
			})
			// Start fading
			setTimeout(() => {
				e.setAttribute("style", styles + " opacity: 0;")
			}, 1000)
			// Finish fading
			setTimeout(() => {
				e.remove()
			}, 3000)
		}
	}
	updateSelection() {
		const _viewport = this.viewport;
		// update handles / bounding box
		if (this.selection != null) {
			// update bounding box
			Object.assign(this.selection.boundingBox, getBoundingBox(this.selection.objects.map((v) => v.getBoundingRect(_viewport))));
			this.selection.originalBoundingBox = { x: this.selection.boundingBox.x, y: this.selection.boundingBox.y, w: this.selection.boundingBox.w, h: this.selection.boundingBox.h };
			// update handles
			var savedHandles = this.selection.handles.filter((v) => v.isDragging);
			this.selection.handles = this.getAllHandles()
			this.selection.handles = this.selection.handles.filter((v) => Math.min(1000, ...savedHandles.map((h) => dist(v.pos, h.pos))) > 15)
			this.selection.handles.push(...savedHandles)
		}
		// update window
		var window = document.querySelector(".selection-window")
		if (window == null) throw new Error(".selection-window is missing")
		if (this.selection == null) {
			window.classList.remove("active")
		} else {
			window.classList.add("active")
		}
		// update number in window
		var number = document.querySelector("#selection-number")
		if (number == null) throw new Error("#selection-number is missing")
		number.textContent = this.selection?.objects.length.toString() ?? "0";
		// update s in number in window
		var s = document.querySelector("#selection-s")
		if (s == null) throw new Error("#selection-s is missing")
		if (this.selection?.objects.length == 1) s.classList.add("hidden");
		else s.classList.remove("hidden");
		// update colors in window
		var colors = document.querySelector("#selection-color-container")
		if (colors == null) throw new Error("#selection-color-container is missing")
		if (this.selection == null || (this.selection?.objects.filter((v) => ! Object.keys(v.data).includes("color")).length ?? 0) >= 1) colors.classList.add("inactive");
		else colors.classList.remove("inactive");
	}
	getAllHandles() {
		if (this.selection == null) return [];
		if (this.selection.objects.length == 1) return [
			new LinearMovementHandle(this.viewport, this.selection),
			...this.selection.objects[0].getHandles(this.viewport, this.selection.boundingBox)
		]; else return [new LinearMovementHandle(this.viewport, this.selection)]
	}
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 * @param {boolean} isEraserButton
	 * @returns {TouchMode<Whiteboard2D>}
	 */
	getTouchMode(touch, isEraserButton) {
		if (isEraserButton) return new EraseTouchMode(touch)
		// First of all, if there is another touch, we are definitely zooming or panning or something.
		if (touch.allTouches.length >= 1) {
			// Also, so are all the other touches.
			var _t = [...touch.allTouches]
			for (var i = 0; i < _t.length; i++) {
				_t[i].cancel()
				_t[i].mode = new PanTouchMode(_t[i])
				touch.allTouches.push(_t[i])
			}
			return new PanTouchMode(touch)
		}
		// Check if we are dragging on a handle.
		if (touch.whiteboard.selection != null) {
			/** @type {Handle | null} */
			var closestHandle = null;
			var closestHandleDistance = 30; // handle distance must be at most 30px
			for (var handle of touch.whiteboard.selection.handles) {
				if (handle.isDragging) continue;
				var handleScreenPos = touch.whiteboard.viewport.getScreenPosFromStagePos(handle.pos.x, handle.pos.y)
				// Check if this handle is close enough
				if (dist(touch, handleScreenPos) < closestHandleDistance) {
					closestHandle = handle;
					closestHandleDistance = dist(touch, handleScreenPos);
				}
			}
			if (closestHandle != null) return new HandleDraggingTouchMode(touch, closestHandle);
		}
		// Then, find the selected mode in the toolbar.
		var mode = getCurrentMode()
		if (mode == "Draw") {
			let drawingMode = drawingModes[selectedDrawingMode]
			if (drawingMode.type == "drawing") return new Draw2DTouchMode(touch, selectedColor)
			else return new Draw2DShapeTouchMode(touch, selectedColor, drawingMode)
		}
		if (mode == "Text") return new TextTouchMode(touch)
		if (mode == "Move") return new PanTouchMode(touch)
		if (mode == "Select") return new SelectTouchMode(touch)
		if (mode == "Erase") return new EraseTouchMode(touch)
		// Uhhhh.....
		return new PanTouchMode(touch)
	}
}



/**
 * @typedef {{ icon: string } & ({ type: "drawing" } | { type: "shape", shapeID: string, makeShape: (start: Point, end: Point) => Point[] })} DrawingShape
 * @type {DrawingShape[]}
 */
var drawingModes = [
	{ icon: "M 1.5 8 Q 5 -1 5 5.5 Q 5 9 8.5 2",
		type: "drawing"
	},
	{ icon: "M 2 8 L 8 2",
		type: "shape", shapeID: "line", makeShape: (start, end) => {
			return [start, end]
		}
	},
	{ icon: "M 1 2 L 1 8 L 9 8 L 9 2 Z",
		type: "shape", shapeID: "rect", makeShape: (start, end) => {
			return [
				{ x: start.x, y: start.y },
				{ x: end.x, y: start.y },
				{ x: end.x, y: end.y },
				{ x: start.x, y: end.y },
				{ x: start.x, y: start.y }
			]
		}
	},
	{ icon: "M 5 1 A 1 1 0 0 0 5 9 A 1 1 0 0 0 5 1 Z",
		type: "shape", shapeID: "circle", makeShape: (start, end) => {
			var rx = Math.abs(end.x - start.x)
			var ry = Math.abs(end.y - start.y)
			var r = Math.sqrt((rx*rx) + (ry*ry))
			// Generate points
			var circlePoints = [];
			var resolution = 60;
			for (var i = 0; i <= resolution; i++) {
				var theta = 2 * Math.PI * (i / resolution);
				circlePoints.push({
					x: start.x + (r * Math.cos(theta)),
					y: start.y + (r * Math.sin(theta))
				});
			}
			return circlePoints;
		}
	}
]
var selectedDrawingMode = 0;
(function makeDrawingModeButtons() {
	// Get container
	var modeContainer = document.querySelector("#drawing_mode_select")
	if (modeContainer == null) throw new Error("Drawing mode selector container is missing!")
	// if (! (modeContainer instanceof HTMLElement)) throw new Error("Main container is not HTML!")
	for (var i = 0; i < drawingModes.length; i++) {
		let button = modeContainer.appendChild(document.createElement("div"))
		button.classList.add("small-menu-option")
		if (selectedDrawingMode == i) button.classList.add("menu-option-selected");
		button.innerHTML = `<svg viewBox="0 0 10 10"><path d="${drawingModes[i].icon}" fill="none" stroke="currentColor" stroke-width="1" /></svg>`
		button.addEventListener("mousedown", ((/** @type {number} */ i) => {
			selectedDrawingMode = i;
			document.querySelector("#drawing_mode_select .menu-option-selected")?.classList.remove("menu-option-selected");
			button.classList.add("menu-option-selected");
		}).bind(null, i));
		button.addEventListener("touchstart", ((/** @type {number} */ i) => {
			selectedDrawingMode = i;
			document.querySelector("#drawing_mode_select .menu-option-selected")?.classList.remove("menu-option-selected");
			button.classList.add("menu-option-selected");
		}).bind(null, i));
	}
})();
var allColors = ["black", "red", "orange", "yellow", "#cc1", "green", "lime", "cyan", "blue", "purple", "#80f", "magenta", "gray", "brown"];
var selectedColor = "black";
(function makeColorButtons() {
	// Get container
	var colorContainer = document.querySelector("#color_select")
	if (colorContainer == null) throw new Error("Color selector container is missing!")
	for (var color of allColors) {
		let button = colorContainer.appendChild(document.createElement("div"))
		button.classList.add("small-menu-option")
		if (selectedColor == color) button.classList.add("menu-option-selected");
		button.innerHTML = `<svg style="outline: 1px solid white;" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="${color}" /></svg>`
		button.addEventListener("mousedown", ((/** @type {string} */ color) => {
			selectedColor = color;
			document.querySelector("#color_select .menu-option-selected")?.classList.remove("menu-option-selected");
			button.classList.add("menu-option-selected");
		}).bind(null, color));
		button.addEventListener("touchstart", ((/** @type {string} */ color) => {
			selectedColor = color;
			document.querySelector("#color_select .menu-option-selected")?.classList.remove("menu-option-selected");
			button.classList.add("menu-option-selected");
		}).bind(null, color));
		// Wrap lines
		if (colorContainer.children.length == 7) colorContainer.appendChild(document.createElement("br"))
	}
})();
(function makeColorButtons() {
	// Get container
	var colorContainer = document.querySelector("#selection-color-container")
	if (colorContainer == null) throw new Error("Selection color selector container is missing!")
	for (var color of allColors) {
		let button = colorContainer.appendChild(document.createElement("div"))
		button.classList.add("small-menu-option")
		button.innerHTML = `<svg style="outline: 1px solid white;" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="${color}" /></svg>`
		button.addEventListener("click", ((/** @type {string} */ color) => {
			button.setAttribute("style", `transform: scale(5);`);
			requestAnimationFrame(() => {
				button.classList.add("menu-option-selected");
				button.removeAttribute("style");
			});
			setTimeout(() => {
				button.classList.remove("menu-option-selected")
			}, 1000);
			whiteboard.selection?.objects.filter((v) => Object.keys(v.data).includes("color")).forEach((v) => {
				v.data.color = color;
				v.editedTime = Date.now();
				v.reload();
			});
		}).bind(null, color));
		// Wrap lines
		if (colorContainer.children.length == 7) colorContainer.appendChild(document.createElement("br"))
	}
})();

/**
 * @template {AbstractWhiteboard<?, ?>} WhiteboardType
 */
class TrackedTouch {
	/**
	 * @param {WhiteboardType} whiteboard
	 * @param {number} initialX
	 * @param {number} initialY
	 * @param {number} id
	 * @param {TrackedTouch<WhiteboardType>[]} allTouches
	 * @param {boolean} isEraserButton
	 */
	constructor(whiteboard, initialX, initialY, id, allTouches, isEraserButton) {
		this.whiteboard = whiteboard
		this.x = initialX
		this.y = initialY
		this.id = id
		this.allTouches = allTouches
		this.mode = whiteboard.getTouchMode(this, isEraserButton)
		// blur current element
		var a = document.activeElement
		if (a != null) {
			if (a instanceof HTMLElement) {
				a.blur()
			}
		}
	}
	/**
	 * @param {number} newX
	 * @param {number} newY
	 */
	updatePos(newX, newY) {
		this.mode.onMove(this.x, this.y, newX, newY)
		this.x = newX
		this.y = newY
	}
	remove() {
		this.mode.onEnd(this.x, this.y)
		this.allTouches.splice(this.allTouches.indexOf(this), 1)
	}
	cancel() {
		this.mode.onCancel(this.x, this.y)
		this.allTouches.splice(this.allTouches.indexOf(this), 1)
	}
	toString() {
		return `TrackedTouch { x: ${this.x}; y: ${this.y}; mode: ${this.mode.toString()} }`
	}
}
/**
 * @template {AbstractWhiteboard<?, ?>} WhiteboardType
 */
class TouchMode {
	/**
	 * @param {TrackedTouch<WhiteboardType>} touch
	 */
	constructor(touch) {
		this.touch = touch
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 */
	render(viewport, canvas) {}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onEnd(previousX, previousY) {}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onCancel(previousX, previousY) {}
	toString() {
		return `TouchMode { broken }`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class Draw2DTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 * @param {string} color
	 */
	constructor(touch, color) {
		super(touch)
		/** @type {Point[]} */
		this.points = [this.getSavedTouchPos()]
		this.color = color
	}
	getSavedTouchPos() {
		var exactScreenPos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(this.touch.x, this.touch.y)
		var zoomLevel = this.touch.whiteboard.viewport.zoom * 50
		zoomLevel = Math.pow(10, Math.floor(Math.log10(zoomLevel)));
		return {
			x: Math.round(exactScreenPos.x * zoomLevel) / zoomLevel,
			y: Math.round(exactScreenPos.y * zoomLevel) / zoomLevel
		}
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 */
	render(viewport, canvas) {
		canvas.fillStyle = "none"
		canvas.strokeStyle = "red"
		canvas.lineWidth = 5
		canvas.globalAlpha = 1
		// Draw lines
		canvas.beginPath()
		let drawPos = viewport.getScreenPosFromStagePos(this.points[0].x, this.points[0].y); canvas.moveTo(drawPos.x, drawPos.y);
		for (var i = 1; i < this.points.length; i++) {
			let drawPos = viewport.getScreenPosFromStagePos(this.points[i].x, this.points[i].y); canvas.lineTo(drawPos.x, drawPos.y);
		}
		canvas.stroke()
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
		var newPos = this.getSavedTouchPos()
		if (this.points.at(-1)?.x == newPos.x && this.points.at(-1)?.y == newPos.y) return;
		this.points.push(newPos)
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onEnd(previousX, previousY) {
		// Add drawing to screen
		if (this.points.length > 3) {
			this.touch.whiteboard.doAction(new USICreateObjects(this.touch.whiteboard, [{
				typeID: "drawing",
				objectID: AbstractSceneObject.generateObjectID(),
				data: {
					"d": DrawingObject.savePointList(this.points),
					"color": this.color
				},
				blob: null
			}]))
		}
	}
	toString() {
		return `DrawTouchMode { ${this.points.length} points }`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class Draw2DShapeTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 * @param {string} color
	 * @param {{ shapeID: string, makeShape: (start: Point, end: Point) => Point[] }} drawing_mode
	 */
	constructor(touch, color, drawing_mode) {
		super(touch)
		/** @type {Point} */
		this.start = this.getSavedTouchPos()
		/** @type {Point} */
		this.end = this.getSavedTouchPos()
		this.color = color
		this.drawing_mode = drawing_mode
	}
	getSavedTouchPos() {
		var exactScreenPos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(this.touch.x, this.touch.y)
		var zoomLevel = this.touch.whiteboard.viewport.zoom * 50
		zoomLevel = Math.pow(10, Math.floor(Math.log10(zoomLevel)));
		return {
			x: Math.round(exactScreenPos.x * zoomLevel) / zoomLevel,
			y: Math.round(exactScreenPos.y * zoomLevel) / zoomLevel
		}
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 */
	render(viewport, canvas) {
		canvas.fillStyle = "none"
		canvas.strokeStyle = "red"
		canvas.lineWidth = 5
		canvas.globalAlpha = 1
		// Get lines from drawing mode
		var points = this.drawing_mode.makeShape(this.start, this.end)
		// Draw lines
		canvas.beginPath()
		let drawPos = viewport.getScreenPosFromStagePos(points[0].x, points[0].y); canvas.moveTo(drawPos.x, drawPos.y);
		for (var i = 1; i < points.length; i++) {
			let drawPos = viewport.getScreenPosFromStagePos(points[i].x, points[i].y); canvas.lineTo(drawPos.x, drawPos.y);
		}
		canvas.stroke()
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
		this.end = this.getSavedTouchPos()
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onEnd(previousX, previousY) {
		// Add drawing to screen
		if (dist(this.start, this.end) > 3 / this.touch.whiteboard.viewport.zoom) {
			this.touch.whiteboard.doAction(new USICreateObjects(this.touch.whiteboard, [{
				typeID: "shape",
				objectID: AbstractSceneObject.generateObjectID(),
				data: {
					"shape": this.drawing_mode.shapeID,
					"start": this.start,
					"end": this.end,
					"color": this.color
				},
				blob: null
			}]))
		}
	}
	toString() {
		return `Draw2DShapeTouchMode { shapeID: ${this.drawing_mode.shapeID}, start: ${JSON.stringify(this.start)}, end: ${JSON.stringify(this.end)} }`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class TextTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 */
	constructor(touch) {
		super(touch)
		/** @type {HTMLTextAreaElement | null} */
		this.focusTextArea = null;
		// Check if we are clicking on a text box
		var checkPos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(touch.x, touch.y)
		var textbox = this.touch.whiteboard.objects.filter((v) => v instanceof TextObject).find((v) => v.colliderect(this.touch.whiteboard.viewport, { x: checkPos.x, y: checkPos.y, w: 0, h: 0 }))
		if (textbox != undefined) {
			var e = textbox.createTextAreaElement(this.touch.whiteboard.viewport);
			document.querySelector(".mainContainer")?.appendChild(e);
			this.focusTextArea = e;
		}
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onEnd(previousX, previousY) {
		if (this.focusTextArea == null) {
			this.touch.whiteboard.doAction(new USICreateObjects(this.touch.whiteboard, [{
				typeID: "text",
				objectID: AbstractSceneObject.generateObjectID(),
				data: {
					"pos": this.touch.whiteboard.viewport.getStagePosFromScreenPos(previousX, previousY),
					"width": 200,
					"scale": 1.5 / this.touch.whiteboard.viewport.zoom,
					"text": "Enter text here"
				},
				blob: null
			}]))
		} else {
			this.focusTextArea.focus();
		}
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onCancel(previousX, previousY) {
	}
	toString() {
		return `TextTouchMode { }`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class PanTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 */
	constructor(touch) {
		super(touch)
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
		var previousPos = {
			x: avg(this.touch.allTouches.map((v) => v.x)),
			y: avg(this.touch.allTouches.map((v) => v.y))
		}
		var previousZoom = avg(this.touch.allTouches.map((v) => dist(v, previousPos)))
		var target = this.touch
		var newPos = {
			x: avg(this.touch.allTouches.map((v) => (v == target ? newX : v.x))),
			y: avg(this.touch.allTouches.map((v) => (v == target ? newY : v.y)))
		}
		var newZoom = avg(this.touch.allTouches.map((v) => dist(v == target ? {x:newX,y:newY} : v, newPos)))
		var zoom = newZoom / previousZoom
		if (previousZoom == 0 || newZoom == 0) zoom = 1
		var viewport = this.touch.whiteboard.viewport;
		viewport.x += newPos.x - previousPos.x
		viewport.y += newPos.y - previousPos.y
		viewport.zoomView(newPos, zoom)
	}
	toString() {
		return `PanTouchMode {}`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class SelectTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 */
	constructor(touch) {
		super(touch)
		/** @type {Point} */
		this.startPos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(touch.x, touch.y)
		/** @type {Point} */
		this.endPos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(touch.x, touch.y)
	}
	/**
	 * @param {Viewport} viewport
	 * @param {CanvasRenderingContext2D} canvas
	 */
	render(viewport, canvas) {
		canvas.fillStyle = "#AAF"
		canvas.strokeStyle = "none"
		canvas.globalAlpha = 0.5
		// Draw rectangle
		var screenStartPos = viewport.getScreenPosFromStagePos(this.startPos.x, this.startPos.y);
		var screenEndPos = viewport.getScreenPosFromStagePos(this.endPos.x, this.endPos.y);
		var actualSize = { x: screenEndPos.x - screenStartPos.x, y: screenEndPos.y - screenStartPos.y }
		canvas.fillRect(screenStartPos.x, screenStartPos.y, actualSize.x, actualSize.y)
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
		this.endPos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(newX, newY)
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onEnd(previousX, previousY) {
		// Normalize the rectangle
		var x = this.startPos.x
		var y = this.startPos.y
		var width = this.endPos.x - this.startPos.x
		if (width < 0) {
			x = this.endPos.x
			width = -width
		}
		var height = this.endPos.y - this.startPos.y
		if (height < 0) {
			y = this.endPos.y
			height = -height
		}
		/** @type {Rect} */
		var rect = { x, y, w: width, h: height }
		// === Select items! ===
		var selectedItems = new Set()
		// Keep previously selected items if shift key is pressed
		if (this.touch.whiteboard.shiftKeyDown && this.touch.whiteboard.selection != null) {
			this.touch.whiteboard.selection.objects.forEach((v) => selectedItems.add(v))
		}
		// Check all objects...
		for (var i = 0; i < this.touch.whiteboard.objects.length; i++) {
			var obj = this.touch.whiteboard.objects[i];
			// ...except objects on another layer
			if (this.touch.whiteboard.strictLayer && obj.layer != this.touch.whiteboard.selectedLayer) continue;
			// Check if the object collides with the selection rectangle
			if (obj.colliderect(this.touch.whiteboard.viewport, rect)) {
				// Toggle the object selection
				if (selectedItems.has(obj)) selectedItems.delete(obj)
				else selectedItems.add(obj)
			}
		}
		// Update whiteboard selection value
		if (selectedItems.size == 0) this.touch.whiteboard.selection = null;
		else this.touch.whiteboard.selection = { objects: [...selectedItems], originalBoundingBox: { x: 0, y: 0, w: 0, h: 0 }, boundingBox: { x: 0, y: 0, w: 0, h: 0 }, handles: [] }
		this.touch.whiteboard.updateSelection() // `originalBoundingBox`, `boundingBox` and `handles` will be set here
	}
	toString() {
		return `SelectTouchMode { start: ${this.startPos.x}, ${this.startPos.y}, end: ${this.endPos.x}, ${this.endPos.y} }`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class EraseTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 */
	constructor(touch) {
		super(touch)
		// Erase around this position
		var touchLoc = this.touch.whiteboard.viewport.getStagePosFromScreenPos(touch.x, touch.y);
		var rad = 10 / this.touch.whiteboard.viewport.zoom
		this.eraseLine({
			start: { x: touchLoc.x - rad, y: touchLoc.y - rad },
			  end: { x: touchLoc.x + rad, y: touchLoc.y + rad }
		})
		this.eraseLine({
			start: { x: touchLoc.x + rad, y: touchLoc.y - rad },
			  end: { x: touchLoc.x - rad, y: touchLoc.y + rad }
		})
	}
	/** @param {Line} line */
	eraseLine(line) {
		var o = [...this.touch.whiteboard.objects]
		for (var i = 0; i < o.length; i++) {
			// Don't erase if the object is unverified
			if (! o[i].verified) continue;
			// Don't erase if we are on another layer
			if (this.touch.whiteboard.strictLayer && o[i].layer != this.touch.whiteboard.selectedLayer) continue;
			// Don't erase if this is an image (images can still be erased with the selection tool!)
			if (o[i] instanceof ImageObject) continue;
			// Check for collision
			if (! o[i].collideline(this.touch.whiteboard.viewport, line)) continue;
			// Erase the object
			this.touch.whiteboard.doAction(new USIEraseObjects(this.touch.whiteboard, [{
				typeID: o[i].getTypeID(), objectID: o[i].objectID, data: o[i].data, blob: this.touch.whiteboard.blobs.get(o[i].objectID) ?? null
			}]))
		}
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
		this.eraseLine({
			start: this.touch.whiteboard.viewport.getStagePosFromScreenPos(previousX, previousY),
			end: this.touch.whiteboard.viewport.getStagePosFromScreenPos(newX, newY)
		})
	}
	toString() {
		return `EraseTouchMode {}`
	}
}
/**
 * @extends {TouchMode<Whiteboard2D>}
 */
class HandleDraggingTouchMode extends TouchMode {
	/**
	 * @param {TrackedTouch<Whiteboard2D>} touch
	 * @param {Handle} handle
	 */
	constructor(touch, handle) {
		super(touch)
		this.handle = handle
		this.handle.isDragging = true;
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 * @param {number} newX
	 * @param {number} newY
	 */
	onMove(previousX, previousY, newX, newY) {
		var mouseStagePos = this.touch.whiteboard.viewport.getStagePosFromScreenPos(newX, newY)
		this.handle.moveTo(mouseStagePos.x, mouseStagePos.y)
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onEnd(previousX, previousY) {
		this.handle.finishMovement()
		this.touch.whiteboard.updateSelection()
	}
	/**
	 * @param {number} previousX
	 * @param {number} previousY
	 */
	onCancel(previousX, previousY) {
		// this.handle.cancel()
		this.handle.isDragging = false;
	}
	toString() {
		return `HandleTouchMode { ${this.handle} }`
	}
}

/**
 * @template {AbstractWhiteboard<?, ?>} WhiteboardType
 */
class TouchHandler {
	/** @param {WhiteboardType} whiteboard */
	constructor(whiteboard) {
		this.whiteboard = whiteboard
		/** @type {TrackedTouch<WhiteboardType>[]} */
		this.touches = []
	}
	/**
	 * @param {number} id
	 * @param {{ x: number; y: number; }} pos
	 */
	mousemove(id, pos) {
		for (var i = 0; i < this.touches.length; i++) {
			if (this.touches[i].id == id) {
				this.touches[i].updatePos(pos.x, pos.y)
			}
		}
	}
	/**
	 * @param {number} id
	 */
	mouseup(id) {
		for (var i = 0; i < this.touches.length; i++) {
			if (this.touches[i].id == id) {
				this.touches[i].remove()
			}
		}
	}
	/**
	 * @param {number} id
	 */
	mousecancel(id) {
		for (var i = 0; i < this.touches.length; i++) {
			if (this.touches[i].id == id) {
				this.touches[i].cancel()
			}
		}
	}
	/** @param {TouchList} touchList */
	handleTouches(touchList) {
		// Check for new or updated touches
		for (var i = 0; i < touchList.length; i++) {
			// See if we already have this touch
			var touchID = touchList[i].identifier
			var idx = this.touches.findIndex((v) => v.id == touchID)
			if (idx == -1) {
				// New touch!
				var touch = new TrackedTouch(this.whiteboard, touchList[i].clientX, touchList[i].clientY, touchID, this.touches, false)
				this.touches.push(touch);
			} else {
				// Update existing touch!
				this.touches[idx].updatePos(touchList[i].clientX, touchList[i].clientY)
			}
		}
		// Check for old touches
		var _t = [...this.touches]
		for (var i = 0; i < _t.length; i++) {
			var touchID = _t[i].id
			var idx = [...touchList].findIndex((v) => v.identifier == touchID)
			if (idx == -1) {
				// Old touch!
				_t[i].remove()
			}
		}
	}
	addEventListeners() {
		const _this = this;
		// Get main element
		var mainContainer = document.querySelector(".mainContainer")
		if (mainContainer == null) throw new Error("Main container is missing!")
		if (! (mainContainer instanceof HTMLElement)) throw new Error("Main container is not HTML!")
		// Mouse Listeners
		mainContainer.addEventListener("mousedown", (e) => {
			if (e.target instanceof HTMLTextAreaElement && getCurrentMode() == "Text") return
			if (e.buttons > 1) {
				_this.mousecancel(0)
				this.touches.push(new TrackedTouch(_this.whiteboard, e.clientX, e.clientY, 0, _this.touches, true));
			} else {
				_this.mouseup(0)
				this.touches.push(new TrackedTouch(_this.whiteboard, e.clientX, e.clientY, 0, _this.touches, false));
			}
		});
		mainContainer.addEventListener("mousemove", (e) => {
			_this.mousemove(0, {
				x: e.clientX,
				y: e.clientY
			});
		});
		mainContainer.addEventListener("mouseup", (e) => {
			_this.mouseup(0);
		});
		mainContainer.addEventListener("contextmenu", (e) => {
			e.preventDefault()
			e.stopPropagation()
		});
		mainContainer.addEventListener("wheel", (e) => {
			_this.whiteboard.viewport.zoomView({
				x: e.clientX,
				y: e.clientY
			}, Math.pow(2, e.deltaY / -500));
		});
		// Touch Listeners
		mainContainer.addEventListener("touchstart", (e) => {
			if (e.target instanceof HTMLTextAreaElement && getCurrentMode() == "Text") return
			e.preventDefault();
			_this.handleTouches(e.touches)
			return false
		}, true);
		mainContainer.addEventListener("touchmove", (e) => {
			if (e.target instanceof HTMLTextAreaElement && getCurrentMode() == "Text") return
			e.preventDefault();
			_this.handleTouches(e.touches)
			return false
		}, true);
		mainContainer.addEventListener("touchcancel", (e) => {
			if (e.target instanceof HTMLTextAreaElement && getCurrentMode() == "Text") return
			e.preventDefault();
			_this.handleTouches(e.touches)
			return false
		}, true);
		mainContainer.addEventListener("touchend", (e) => {
			if (e.target instanceof HTMLTextAreaElement && getCurrentMode() == "Text") return
			e.preventDefault();
			_this.handleTouches(e.touches)
			return false
		}, true);
	}
}

class UndoStackItem {
	/** @param {AbstractWhiteboard<?, ?>} whiteboard */
	constructor(whiteboard) { this.whiteboard = whiteboard; }
	do() { throw new Error(`"UndoStackItem" is an abstract class, "do" must be overridden`); }
	/** @returns {UndoStackItem} */
	invert() { throw new Error(`"UndoStackItem" is an abstract class, "invert" must be overridden`); }
}
class DummyUndoStackItem extends UndoStackItem {
	/**
	 * @param {AbstractWhiteboard<?, ?>} whiteboard
	 * @param {number} n
	 * @param {boolean} inverted
	 */
	constructor(whiteboard, n, inverted) { super(whiteboard); this.n = n; this.inverted = inverted; }
	do() {
		console.log(this.inverted ? "redo" : "undo", this.n)
	}
	invert() { return new DummyUndoStackItem(this.whiteboard, this.n, !this.inverted) }
}
class USICreateObjects extends UndoStackItem {
	/**
	 * @param {AbstractWhiteboard<?, ?>} whiteboard
	 * @param {{ typeID: string, objectID: number, data: Object, blob: Blob | null }[]} objects
	 */
	constructor(whiteboard, objects) { super(whiteboard); this.objects = objects; }
	do() {
		for (var o of this.objects) {
			this.whiteboard.add(AbstractSceneObject.createFromDataAndID(o.objectID, this.whiteboard.selectedLayer, o.typeID, o.data, this.whiteboard.getBlob.bind(this.whiteboard, o.objectID)));
			this.whiteboard.connection.createObject(o.objectID, this.whiteboard.selectedLayer, o.typeID, o.data, o.blob);
		}
	}
	invert() { return new USIEraseObjects(this.whiteboard, [...this.objects]) }
}
class USIEraseObjects extends UndoStackItem {
	/**
	 * @param {AbstractWhiteboard<?, ?>} whiteboard
	 * @param {{ typeID: string, objectID: number, data: Object, blob: Blob | null }[]} objects
	 */
	constructor(whiteboard, objects) { super(whiteboard); this.objects = objects; }
	do() {
		for (var o of this.objects) {
			this.whiteboard.findObject(o.objectID).unverify();
			this.whiteboard.connection.removeObject(o.objectID);
		}
	}
	invert() { return new USICreateObjects(this.whiteboard, [...this.objects]) }
}
class USIEditObjects extends UndoStackItem {
	/**
	 * @param {AbstractWhiteboard<?, ?>} whiteboard
	 * @param {{ objectID: number, previousData: Object, data: Object }[]} objects
	 */
	constructor(whiteboard, objects) { super(whiteboard); this.objects = objects; }
	do() {
		for (var o of this.objects) {
			var realObj = this.whiteboard.findObject(o.objectID);
			realObj.data = o.data;
			realObj.reload();
			this.whiteboard.connection.editObject(o.objectID, o.data);
			if (this.whiteboard instanceof Whiteboard2D) this.whiteboard.updateSelection();
		}
	}
	invert() { return new USIEditObjects(this.whiteboard, this.objects.map((v) => ({
		objectID: v.objectID,
		previousData: v.data,
		data: v.previousData
	}))) }
}



var whiteboard = new Whiteboard2D()
whiteboard.renderer.renderLoop()
