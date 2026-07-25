/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ start: Point, end: Point }} Line
 */

var log = (() => {
	var logElm = document.createElement("div")
	logElm.setAttribute("style", `position: absolute; bottom: 0; right: 0;`)
	document.body.appendChild(logElm)
	/** @param {string} data */
	function log(data) {
		var e = document.createElement("div")
		logElm.appendChild(e)
		e.innerText = data
		setTimeout(() => {
			e.remove()
		}, 3000)
	}
	return log
})();
/**
 * @param {*} o
 * @returns {string}
 */
function repr(o) {
	if (typeof o == "string") {
		return "\"" + o + "\""
	}
	if (typeof o == "number") {
		return o.toString()
	}
	if (o instanceof Array) {
		return "[" + o.map((v) => repr(v)).join(", ") + "]"
	}
	// object
	var keys = Object.keys(o)
	var r = "{"
	for (var i = 0; i < keys.length; i++) {
		if (i != 0) r += ", "
		r += repr(keys[i])
		r += ": "
		r += repr(o[keys[i]])
	}
	r += "}"
	return r
}
/** @param {number[]} o */
function avg(o) {
	return o.reduce((a, b) => a + b, 0) / o.length
}
/**
 * @param {{ x: number, y: number }} point1
 * @param {{ x: number, y: number }} point2
 */
function dist(point1, point2) {
	return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2))
}
/**
 * @param {number} a1x
 * @param {number} a1y
 * @param {number} a2x
 * @param {number} a2y
 * @param {number} b1x
 * @param {number} b1y
 * @param {number} b2x
 * @param {number} b2y
 */
function _line_intersects_line(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
	// from https://stackoverflow.com/questions/9043805/test-if-two-lines-intersect-javascript-function
	var det, gamma, lambda;
	det = (a2x - a1x) * (b2y - b1y) - (b2x - b1x) * (a2y - a1y);
	if (det === 0) {
		return false;
	} else {
		lambda = ((b2y - b1y) * (b2x - a1x) + (b1x - b2x) * (b2y - a1y)) / det;
		gamma = ((a1y - a2y) * (b2x - a1x) + (a2x - a1x) * (b2y - a1y)) / det;
		return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
	}
}
/**
 * @param {Line} line1
 * @param {Line} line2
 */
function line_intersects_line(line1, line2) {
	return _line_intersects_line(line1.start.x, line1.start.y, line1.end.x, line1.end.y, line2.start.x, line2.start.y, line2.end.x, line2.end.y)
}
/**
 * @param {number} rx
 * @param {number} ry
 * @param {number} rw
 * @param {number} rh
 * @param {number} lx1
 * @param {number} ly1
 * @param {number} lx2
 * @param {number} ly2
 */
function _rectangle_intersects_line(rx, ry, rw, rh, lx1, ly1, lx2, ly2) {
	// from https://jvm-gaming.org/t/a-convenient-method-that-tells-you-if-a-rectangle-is-intersecting-a-line/54535
	// determine values to be used in the equation for the line
	var m = (ly2-ly1)/(lx2-lx1);
	var p = lx1, q = ly1; //p = the offset from left side of screen, q = offset from bottom
	// if point l2 is closer to x = 0 than l1, set p and q to lx2's coordinates
	if (lx2 < lx1) {
		p = lx2;
		q = ly2;
	}
	// test if both end points of line are on left side, right, top, or bottom
	// if any is true, then the line does not intersect
	var on_left = lx1 < rx && lx2 < rx;
	var on_right = lx1 > rx+rw && lx2 > rx+rw;
	var on_top = ly1 < ry && ly2 < ry;
	var on_bottom = ly1 > ry+rh && ly2 > ry+rh;
	if (!on_left && !on_right && !on_top && !on_bottom) {
		// if left side or right side of rectangle intersects line
		if (((ry < (m*(rx-p)+q)) && (ry+rh > (m*(rx-p)+q)))
				|| ((ry < (m*(rx+rw-p)+q)) && (ry+rh > (m*(rx+rw-p)+q)))) {
			return true;
		}
		// if top side or bottom side of rectangle intersects line
		if ((rx < (((ry-q)/m)+p) && rx+rw > (((ry-q)/m)+p))
			|| (rx < (((ry+rh-m)/q)+p) && rx+rw > (((ry+rh-q)/m)+p))) {
			return true;
		}
	}
	return false;
}
/**
 * @param {Rect} rect
 * @param {Line} line
 */
function rectangleIntersectsLine(rect, line) {
	return _rectangle_intersects_line(rect.x, rect.y, rect.w, rect.h, line.start.x, line.start.y, line.end.x, line.end.y)
}

var mainCanvas = document.createElement("canvas")
document.querySelector(".mainContainer")?.appendChild(mainCanvas)
mainCanvas.id = "mainCanvas"

var mainCanvasCtx = (() => {
	var ctx = mainCanvas.getContext('2d')
	if (ctx == null) throw new Error("Canvas context not found")
	return ctx;
})();

/**
 * @param {{ x: number, y: number }[]} points
 */
function pointsToPath(points) {
	var r = `M ${points[0].x} ${points[0].y}`
	for (var i = 1; i < points.length; i++) {
		r += ` L ${points[i].x} ${points[i].y}`
	}
	return r
}
