/*
 * A javascript-based implementation of Spatial Navigation.
 *
 * Copyright (c) 2022 Luke Chang.
 * https://github.com/luke-chang/js-spatial-navigation
 *
 * Licensed under the MPL 2.0.
 */
"use strict";

/************************/
/* Global Configuration */
/************************/
// Note: an <extSelector> can be one of following types:
// - a valid selector string for "querySelectorAll" or jQuery (if it exists)
// - a NodeList or an array containing DOM elements
// - a single DOM element
// - a jQuery object
// - a string "@<sectionId>" to indicate the specified section
// - a string "@" to indicate the default section
var GlobalConfig = {
	selector: "", // can be a valid <extSelector> except "@" syntax.
	straightOnly: false,
	straightOverlapThreshold: 0.5,
	rememberSource: false,
	disabled: false,
	defaultElement: "", // <extSelector> except "@" syntax.
	enterTo: "", // '', 'last-focused', 'default-element'
	leaveFor: null, // {left: <extSelector>, right: <extSelector>,
	//  up: <extSelector>, down: <extSelector>}
	restrict: "self-first", // 'self-first', 'self-only', 'none'
	navigableFilter: null,
};

/*********************/
/* Constant Variable */
/*********************/
var KEYMAPPING = {
	37: "left",
	38: "up",
	39: "right",
	40: "down",
};

var REVERSE = {
	left: "right",
	up: "down",
	right: "left",
	down: "up",
};

var EVENT_PREFIX = "sn:";
var ID_POOL_PREFIX = "section-";

/********************/
/* Private Variable */
/********************/
var _idPool = 0;
var _ready = false;
var _pause = false;
/**
 * @type {Map<string | symbol, Object>}
 */
var _sections = new Map();
var _sectionCount = 0;
var _defaultSectionId = "";
var _lastSectionId = "";
var _duringFocusChange = false;

console.log(_sections);

/*****************/
/* Core Function */
/*****************/
function getRect(elem) {
	var cr = elem.getBoundingClientRect();
	var rect = {
		left: cr.left,
		top: cr.top,
		right: cr.right,
		bottom: cr.bottom,
		width: cr.width,
		height: cr.height,
	};
	rect.element = elem;
	rect.center = {
		x: rect.left + Math.floor(rect.width / 2),
		y: rect.top + Math.floor(rect.height / 2),
	};
	rect.center.left = rect.center.right = rect.center.x;
	rect.center.top = rect.center.bottom = rect.center.y;
	return rect;
}

function partition(rects, targetRect, straightOverlapThreshold) {
	var groups = [[], [], [], [], [], [], [], [], []];

	for (var i = 0; i < rects.length; i++) {
		var rect = rects[i];
		var center = rect.center;
		var x, y, groupId;

		if (center.x < targetRect.left) {
			x = 0;
		} else if (center.x <= targetRect.right) {
			x = 1;
		} else {
			x = 2;
		}

		if (center.y < targetRect.top) {
			y = 0;
		} else if (center.y <= targetRect.bottom) {
			y = 1;
		} else {
			y = 2;
		}

		groupId = y * 3 + x;
		groups[groupId].push(rect);

		if ([0, 2, 6, 8].indexOf(groupId) !== -1) {
			var threshold = straightOverlapThreshold;

			if (rect.left <= targetRect.right - targetRect.width * threshold) {
				if (groupId === 2) {
					groups[1].push(rect);
				} else if (groupId === 8) {
					groups[7].push(rect);
				}
			}

			if (rect.right >= targetRect.left + targetRect.width * threshold) {
				if (groupId === 0) {
					groups[1].push(rect);
				} else if (groupId === 6) {
					groups[7].push(rect);
				}
			}

			if (rect.top <= targetRect.bottom - targetRect.height * threshold) {
				if (groupId === 6) {
					groups[3].push(rect);
				} else if (groupId === 8) {
					groups[5].push(rect);
				}
			}

			if (rect.bottom >= targetRect.top + targetRect.height * threshold) {
				if (groupId === 0) {
					groups[3].push(rect);
				} else if (groupId === 2) {
					groups[5].push(rect);
				}
			}
		}
	}

	return groups;
}

function generateDistanceFunction(targetRect) {
	return {
		nearPlumbLineIsBetter: function (rect) {
			var d;
			if (rect.center.x < targetRect.center.x) {
				d = targetRect.center.x - rect.right;
			} else {
				d = rect.left - targetRect.center.x;
			}
			return d < 0 ? 0 : d;
		},
		nearHorizonIsBetter: function (rect) {
			var d;
			if (rect.center.y < targetRect.center.y) {
				d = targetRect.center.y - rect.bottom;
			} else {
				d = rect.top - targetRect.center.y;
			}
			return d < 0 ? 0 : d;
		},
		nearTargetLeftIsBetter: function (rect) {
			var d;
			if (rect.center.x < targetRect.center.x) {
				d = targetRect.left - rect.right;
			} else {
				d = rect.left - targetRect.left;
			}
			return d < 0 ? 0 : d;
		},
		nearTargetTopIsBetter: function (rect) {
			var d;
			if (rect.center.y < targetRect.center.y) {
				d = targetRect.top - rect.bottom;
			} else {
				d = rect.top - targetRect.top;
			}
			return d < 0 ? 0 : d;
		},
		topIsBetter: function (rect) {
			return rect.top;
		},
		bottomIsBetter: function (rect) {
			return -1 * rect.bottom;
		},
		leftIsBetter: function (rect) {
			return rect.left;
		},
		rightIsBetter: function (rect) {
			return -1 * rect.right;
		},
	};
}

function prioritize(priorities) {
	var destPriority = null;
	for (var i = 0; i < priorities.length; i++) {
		if (priorities[i].group.length) {
			destPriority = priorities[i];
			break;
		}
	}

	if (!destPriority) {
		return null;
	}

	var destDistance = destPriority.distance;

	destPriority.group.sort(function (a, b) {
		for (var i = 0; i < destDistance.length; i++) {
			var distance = destDistance[i];
			var delta = distance(a) - distance(b);
			if (delta) {
				return delta;
			}
		}
		return 0;
	});

	return destPriority.group;
}

function navigate(target, direction, candidates, config) {
	if (!target || !direction || !candidates || !candidates.length) {
		return null;
	}

	var rects = [];
	for (var i = 0; i < candidates.length; i++) {
		var rect = getRect(candidates[i]);
		if (rect) {
			rects.push(rect);
		}
	}
	if (!rects.length) {
		return null;
	}

	var targetRect = getRect(target);
	if (!targetRect) {
		return null;
	}

	var distanceFunction = generateDistanceFunction(targetRect);

	var groups = partition(rects, targetRect, config.straightOverlapThreshold);

	var internalGroups = partition(groups[4], targetRect.center, config.straightOverlapThreshold);

	var priorities;

	switch (direction) {
		case "left":
			priorities = [
				{
					group: internalGroups[0].concat(internalGroups[3]).concat(internalGroups[6]),
					distance: [distanceFunction.nearPlumbLineIsBetter, distanceFunction.topIsBetter],
				},
				{
					group: groups[3],
					distance: [distanceFunction.nearPlumbLineIsBetter, distanceFunction.topIsBetter],
				},
				{
					group: groups[0].concat(groups[6]),
					distance: [
						distanceFunction.nearHorizonIsBetter,
						distanceFunction.rightIsBetter,
						distanceFunction.nearTargetTopIsBetter,
					],
				},
			];
			break;
		case "right":
			priorities = [
				{
					group: internalGroups[2].concat(internalGroups[5]).concat(internalGroups[8]),
					distance: [distanceFunction.nearPlumbLineIsBetter, distanceFunction.topIsBetter],
				},
				{
					group: groups[5],
					distance: [distanceFunction.nearPlumbLineIsBetter, distanceFunction.topIsBetter],
				},
				{
					group: groups[2].concat(groups[8]),
					distance: [
						distanceFunction.nearHorizonIsBetter,
						distanceFunction.leftIsBetter,
						distanceFunction.nearTargetTopIsBetter,
					],
				},
			];
			break;
		case "up":
			priorities = [
				{
					group: internalGroups[0].concat(internalGroups[1]).concat(internalGroups[2]),
					distance: [distanceFunction.nearHorizonIsBetter, distanceFunction.leftIsBetter],
				},
				{
					group: groups[1],
					distance: [distanceFunction.nearHorizonIsBetter, distanceFunction.leftIsBetter],
				},
				{
					group: groups[0].concat(groups[2]),
					distance: [
						distanceFunction.nearPlumbLineIsBetter,
						distanceFunction.bottomIsBetter,
						distanceFunction.nearTargetLeftIsBetter,
					],
				},
			];
			break;
		case "down":
			priorities = [
				{
					group: internalGroups[6].concat(internalGroups[7]).concat(internalGroups[8]),
					distance: [distanceFunction.nearHorizonIsBetter, distanceFunction.leftIsBetter],
				},
				{
					group: groups[7],
					distance: [distanceFunction.nearHorizonIsBetter, distanceFunction.leftIsBetter],
				},
				{
					group: groups[6].concat(groups[8]),
					distance: [
						distanceFunction.nearPlumbLineIsBetter,
						distanceFunction.topIsBetter,
						distanceFunction.nearTargetLeftIsBetter,
					],
				},
			];
			break;
		default:
			return null;
	}

	if (config.straightOnly) {
		priorities.pop();
	}

	var destGroup = prioritize(priorities);
	if (!destGroup) {
		return null;
	}

	var dest = null;
	if (
		config.rememberSource &&
		config.previous &&
		config.previous.destination === target &&
		config.previous.reverse === direction
	) {
		for (var j = 0; j < destGroup.length; j++) {
			if (destGroup[j].element === config.previous.target) {
				dest = destGroup[j].element;
				break;
			}
		}
	}

	if (!dest) {
		dest = destGroup[0].element;
	}

	return dest;
}

/********************/
/* Private Function */
/********************/
function generateId() {
	return Symbol("sectionID");
}

function parseSelector(selector) {
	var result = [];
	try {
		if (selector) {
			if (typeof selector === "string") {
				result = [].slice.call(document.querySelectorAll(selector));
			} else if (typeof selector === "object" && selector.length) {
				result = [].slice.call(selector);
			} else if (typeof selector === "object" && selector.nodeType === 1) {
				result = [selector];
			}
		}
	} catch (err) {
		console.error(err);
	}
	return result;
}

/**
 *
 * @param {HTMLElement} elem
 * @param {string} selector
 * @returns
 */
function matchSelector(elem, selector) {
	if (typeof selector === "string") {
		return Element.prototype.matches.call(elem, selector);
	} else if (typeof selector === "object" && selector.length) {
		return selector.indexOf(elem) >= 0;
	} else if (typeof selector === "object" && selector.nodeType === 1) {
		return elem === selector;
	}
	return false;
}

/**
 * @type {HTMLElement | null}
 */
let currentFocus = null;

function isValidSectionID(typeof_SectionID) {
	return typeof_SectionID === "string" || typeof_SectionID === "symbol";
}

function focus(el) {
	if (el === currentFocus) return;

	if (currentFocus) {
		currentFocus.removeAttribute("data-focused");
	}

	if (el) {
		el.setAttribute("data-focused", "");
	}

	currentFocus = el;
}

function getCurrentFocusedElement() {
	return currentFocus;

	var actEl = document.activeElement;
	if (actEl && actEl !== document.body) {
		return actEl;
	}
}

function extend(out) {
	out = out || {};
	for (var i = 1; i < arguments.length; i++) {
		if (!arguments[i]) {
			continue;
		}
		for (var key in arguments[i]) {
			if (arguments[i].hasOwnProperty(key) && arguments[i][key] !== undefined) {
				out[key] = arguments[i][key];
			}
		}
	}
	return out;
}

function exclude(elemList, excludedElem) {
	if (!Array.isArray(excludedElem)) {
		excludedElem = [excludedElem];
	}
	for (var i = 0, index; i < excludedElem.length; i++) {
		index = elemList.indexOf(excludedElem[i]);
		if (index >= 0) {
			elemList.splice(index, 1);
		}
	}
	return elemList;
}

function isNavigable(elem, sectionId, verifySectionSelector) {
	const _section = sectionId ? _sections.get(sectionId) : null;
	if (!elem || !_section || _section.disabled) {
		return false;
	}
	if ((elem.offsetWidth <= 0 && elem.offsetHeight <= 0) || elem.hasAttribute("disabled")) {
		return false;
	}
	if (verifySectionSelector && !matchSelector(elem, _section.selector)) {
		return false;
	}

	const filter = _section.navigableFilter || GlobalConfig.navigableFilter;

	if (filter) {
		return filter(elem, sectionId);
	}

	return true;
}

function getSectionId(elem) {
	for (var [id, _section] of _sections.entries()) {
		if (!_section.disabled && matchSelector(elem, _section.selector)) {
			return id;
		}
	}
}

function getSectionNavigableElements(sectionId) {
	return parseSelector(_sections.get(sectionId).selector).filter(function (elem) {
		return isNavigable(elem, sectionId);
	});
}

function getSectionDefaultElement(sectionId) {
	var defaultElement = parseSelector(_sections.get(sectionId).defaultElement).find(function (elem) {
		return isNavigable(elem, sectionId, true);
	});
	if (!defaultElement) {
		return null;
	}
	return defaultElement;
}

function getSectionLastFocusedElement(sectionId) {
	var lastFocusedElement = _sections.get(sectionId).lastFocusedElement;
	if (!isNavigable(lastFocusedElement, sectionId, true)) {
		return null;
	}
	return lastFocusedElement;
}

/**
 *
 * @param {HTMLElement} elem
 * @param {*} type
 * @param {*} details
 * @param {*} cancelable
 * @returns
 */
function fireEvent(elem, type, details, cancelable) {
	if (arguments.length < 4) {
		cancelable = true;
	}
	var evt = document.createEvent("CustomEvent");
	evt.initCustomEvent(EVENT_PREFIX + type, true, cancelable, details);
	return elem.dispatchEvent(evt);
}

function focusElement(elem, sectionId, direction) {
	if (!elem) {
		return false;
	}

	var currentFocusedElement = getCurrentFocusedElement();

	var silentFocus = function () {
		if (currentFocusedElement) {
			// currentFocusedElement.blur();
			focus(null);
		}
		// elem.focus();
		focus(elem);
		focusChanged(elem, sectionId);
	};

	if (_duringFocusChange) {
		silentFocus();
		return true;
	}

	_duringFocusChange = true;

	if (_pause) {
		silentFocus();
		_duringFocusChange = false;
		return true;
	}

	if (currentFocusedElement) {
		var unfocusProperties = {
			nextElement: elem,
			nextSectionId: sectionId,
			direction: direction,
			native: false,
		};
		if (!fireEvent(currentFocusedElement, "willunfocus", unfocusProperties)) {
			_duringFocusChange = false;
			return false;
		}
		// currentFocusedElement.blur();
		focus(null);
		fireEvent(currentFocusedElement, "unfocused", unfocusProperties, false);
	}

	var focusProperties = {
		previousElement: currentFocusedElement,
		sectionId: sectionId,
		direction: direction,
		native: false,
	};
	if (!fireEvent(elem, "willfocus", focusProperties)) {
		_duringFocusChange = false;
		return false;
	}
	// elem.focus();
	focus(elem);
	fireEvent(elem, "focused", focusProperties, false);

	_duringFocusChange = false;

	focusChanged(elem, sectionId);
	return true;
}

function focusChanged(elem, sectionId) {
	if (!sectionId) {
		sectionId = getSectionId(elem);
	}
	if (sectionId) {
		_sections.get(sectionId).lastFocusedElement = elem;
		_lastSectionId = sectionId;
	}
}

function focusExtendedSelector(selector, direction) {
	if (selector.charAt(0) == "@") {
		if (selector.length == 1) {
			return focusSection();
		} else {
			var sectionId = selector.substr(1);
			return focusSection(sectionId);
		}
	} else if (typeof selector === "symbol") {
		return focusSection(selector);
	} else {
		var next = parseSelector(selector)[0];
		if (next) {
			var nextSectionId = getSectionId(next);
			if (isNavigable(next, nextSectionId)) {
				return focusElement(next, nextSectionId, direction);
			}
		}
	}
	return false;
}

function focusSection(sectionId) {
	var range = [];
	var addRange = function (id) {
		const _section = _sections.get(id);
		if (id && range.indexOf(id) < 0 && _section && !_section.disabled) {
			range.push(id);
		}
	};

	if (sectionId) {
		addRange(sectionId);
	} else {
		addRange(_defaultSectionId);
		addRange(_lastSectionId);
		for (let key of _sections.keys()) {
			addRange(key);
		}
	}

	for (var i = 0; i < range.length; i++) {
		var id = range[i];
		var next;

		if (_sections.get(id).enterTo == "last-focused") {
			next = getSectionLastFocusedElement(id) || getSectionDefaultElement(id) || getSectionNavigableElements(id)[0];
		} else {
			next = getSectionDefaultElement(id) || getSectionLastFocusedElement(id) || getSectionNavigableElements(id)[0];
		}

		if (next) {
			return focusElement(next, id);
		}
	}

	return false;
}

function fireNavigatefailed(elem, direction) {
	fireEvent(
		elem,
		"navigatefailed",
		{
			direction: direction,
		},
		false
	);
}

function gotoLeaveFor(sectionId, direction) {
	const _section = _sections.get(sectionId);
	if (_section.leaveFor && _section.leaveFor[direction] !== undefined) {
		var next = _section.leaveFor[direction];

		if (isValidSectionID(typeof next)) {
			if (next === "") {
				return null;
			}
			return focusExtendedSelector(next, direction);
		}

		var nextSectionId = getSectionId(next);
		if (isNavigable(next, nextSectionId)) {
			return focusElement(next, nextSectionId, direction);
		}
	}
	return false;
}

function focusNext(direction, currentFocusedElement, currentSectionId) {
	var extSelector = currentFocusedElement.getAttribute("data-sn-" + direction);
	if (typeof extSelector === "string") {
		if (extSelector === "" || !focusExtendedSelector(extSelector, direction)) {
			fireNavigatefailed(currentFocusedElement, direction);
			return false;
		}
		return true;
	}

	/**
	 * @type {Map<string | symbol, Array<{}>>}
	 */
	var sectionNavigableElements = new Map();
	var allNavigableElements = [];

	for (var id of _sections.keys()) {
		const _navigableElements = getSectionNavigableElements(id);
		sectionNavigableElements.set(id, _navigableElements);
		allNavigableElements = allNavigableElements.concat(_navigableElements);
	}

	var config = extend({}, GlobalConfig, _sections.get(currentSectionId));
	var next;

	if (config.restrict == "self-only" || config.restrict == "self-first") {
		var currentSectionNavigableElements = sectionNavigableElements.get(currentSectionId);

		next = navigate(
			currentFocusedElement,
			direction,
			exclude(currentSectionNavigableElements, currentFocusedElement),
			config
		);

		if (!next && config.restrict == "self-first") {
			next = navigate(
				currentFocusedElement,
				direction,
				exclude(allNavigableElements, currentSectionNavigableElements),
				config
			);
		}
	} else {
		next = navigate(currentFocusedElement, direction, exclude(allNavigableElements, currentFocusedElement), config);
	}

	if (next) {
		_sections.get(currentSectionId).previous = {
			target: currentFocusedElement,
			destination: next,
			reverse: REVERSE[direction],
		};

		var nextSectionId = getSectionId(next);

		if (currentSectionId != nextSectionId) {
			var result = gotoLeaveFor(currentSectionId, direction);
			if (result) {
				return true;
			} else if (result === null) {
				fireNavigatefailed(currentFocusedElement, direction);
				return false;
			}

			var enterToElement;
			switch (_sections.get(nextSectionId).enterTo) {
				case "last-focused":
					enterToElement = getSectionLastFocusedElement(nextSectionId) || getSectionDefaultElement(nextSectionId);
					break;
				case "default-element":
					enterToElement = getSectionDefaultElement(nextSectionId);
					break;
			}
			if (enterToElement) {
				next = enterToElement;
			}
		}

		return focusElement(next, nextSectionId, direction);
	} else if (gotoLeaveFor(currentSectionId, direction)) {
		return true;
	}

	fireNavigatefailed(currentFocusedElement, direction);
	return false;
}

function onKeyDown(evt) {
	if (!_sectionCount || _pause || evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey) {
		return;
	}

	var currentFocusedElement;
	var preventDefault = function () {
		evt.preventDefault();
		evt.stopPropagation();
		return false;
	};

	var direction = KEYMAPPING[evt.keyCode];
	if (!direction) {
		if (evt.keyCode == 13) {
			currentFocusedElement = getCurrentFocusedElement();
			if (currentFocusedElement && getSectionId(currentFocusedElement)) {
				if (!fireEvent(currentFocusedElement, "enter-down")) {
					return preventDefault();
				}
			}
		}
		return;
	}

	currentFocusedElement = getCurrentFocusedElement();

	if (!currentFocusedElement) {
		if (_lastSectionId) {
			currentFocusedElement = getSectionLastFocusedElement(_lastSectionId);
		}
		if (!currentFocusedElement) {
			focusSection();
			return preventDefault();
		}
	}

	var currentSectionId = getSectionId(currentFocusedElement);
	if (!currentSectionId) {
		return;
	}

	var willmoveProperties = {
		direction: direction,
		sectionId: currentSectionId,
		cause: "keydown",
	};

	if (fireEvent(currentFocusedElement, "willmove", willmoveProperties)) {
		focusNext(direction, currentFocusedElement, currentSectionId);
	}

	return preventDefault();
}

function onKeyUp(evt) {
	if (evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey) {
		return;
	}
	if (!_pause && _sectionCount && evt.keyCode == 13) {
		var currentFocusedElement = getCurrentFocusedElement();
		if (currentFocusedElement && getSectionId(currentFocusedElement)) {
			if (!fireEvent(currentFocusedElement, "enter-up")) {
				evt.preventDefault();
				evt.stopPropagation();
			}
		}
	}
}

/*******************/
/* Public Function */
/*******************/
var SpatialNavigation = {
	init: function () {
		if (!_ready) {
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			_ready = true;
		}
	},

	uninit: function () {
		window.removeEventListener("keyup", onKeyUp);
		window.removeEventListener("keydown", onKeyDown);
		SpatialNavigation.clear();
		_idPool = 0;
		_ready = false;
	},

	clear: function () {
		_sections.clear();
		_sectionCount = 0;
		_defaultSectionId = "";
		_lastSectionId = "";
		_duringFocusChange = false;
	},

	// set(<config>);
	// set(<sectionId>, <config>);
	set: function (arg0, arg1) {
		var sectionId, config;

		if (typeof arg0 === "object") {
			config = arg0;
		} else if (isValidSectionID(typeof arg0) && typeof arg1 === "object") {
			sectionId = arg0;
			config = arg1;
			if (!_sections.has(sectionId)) {
				throw new Error('Section "' + sectionId + "\" doesn't exist!");
			}
		} else {
			return;
		}

		const _section = sectionId ? _sections.get(sectionId) : null;

		for (var key in config) {
			if (GlobalConfig[key] !== undefined) {
				if (_section) {
					_section[key] = config[key];
				} else if (config[key] !== undefined) {
					GlobalConfig[key] = config[key];
				}
			}
		}

		if (sectionId) {
			_sections.set(sectionId, extend({}, _section));
		}
	},

	// add(<config>);
	// add(<sectionId>, <config>);
	add: function (arg0, arg1) {
		/**
		 * @type {string | symbol}
		 */
		var sectionId;
		var config = {};

		if (typeof arg0 === "object") {
			config = arg0;
		} else if (isValidSectionID(typeof arg0) && typeof arg1 === "object") {
			sectionId = arg0;
			config = arg1;
		}

		if (!sectionId) {
			sectionId = isValidSectionID(typeof config.id) ? config.id : generateId();
		}

		if (_sections.has(sectionId)) {
			throw new Error('Section "' + sectionId + '" has already existed!');
		}

		_sections.set(sectionId, {});
		_sectionCount++;

		SpatialNavigation.set(sectionId, config);

		return sectionId;
	},

	remove: function (sectionId) {
		if (!sectionId || !isValidSectionID(typeof sectionId)) {
			throw new Error('Please assign the "sectionId"!');
		}

		const deleted = _sections.delete(sectionId);

		if (deleted) {
			_sectionCount--;
			if (_lastSectionId === sectionId) {
				_lastSectionId = "";
			}
			return deleted;
		}
		return false;
	},

	disable: function (sectionId) {
		const _section = _sections.get(sectionId);
		if (_section) {
			_section.disabled = true;
			return true;
		}
		return false;
	},

	enable: function (sectionId) {
		const _section = _sections.get(sectionId);
		if (_section) {
			_section.disabled = false;
			return true;
		}
		return false;
	},

	pause: function () {
		_pause = true;
	},

	resume: function () {
		_pause = false;
	},

	// focus([silent])
	// focus(<sectionId>, [silent])
	// focus(<extSelector>, [silent])
	// Note: "silent" is optional and default to false
	focus: function (elem, silent) {
		var result = false;

		// if silent is not defined and elem is a boolean
		if (silent === undefined && typeof elem === "boolean") {
			// silent becomes elem
			silent = elem;

			elem = undefined;
		}

		var autoPause = !_pause && silent;

		if (autoPause) {
			SpatialNavigation.pause();
		}

		if (!elem) {
			result = focusSection();
		} else {
			if (isValidSectionID(typeof elem)) {
				if (_sections.has(elem)) {
					result = focusSection(elem);
				} else {
					result = focusExtendedSelector(elem);
				}
			} else {
				var nextSectionId = getSectionId(elem);
				if (isNavigable(elem, nextSectionId)) {
					result = focusElement(elem, nextSectionId);
				}
			}
		}

		if (autoPause) {
			SpatialNavigation.resume();
		}

		return result;
	},

	/**
	 *
	 * @param {"up"} direction
	 * @returns
	 */
	move: function (direction) {
		direction = direction.toLowerCase();
		if (!REVERSE[direction]) {
			return false;
		}

		var elem = getCurrentFocusedElement();
		if (!elem) {
			return false;
		}

		var sectionId = getSectionId(elem);
		if (!sectionId) {
			return false;
		}

		var willmoveProperties = {
			direction: direction,
			sectionId: sectionId,
			cause: "api",
		};

		if (!fireEvent(elem, "willmove", willmoveProperties)) {
			return false;
		}

		return focusNext(direction, elem, sectionId);
	},
	makeFocusable() {},

	setDefaultSection: function (sectionId) {
		if (!sectionId) {
			_defaultSectionId = "";
		} else if (!_sections.has(sectionId)) {
			throw new Error('Section "' + sectionId + "\" doesn't exist!");
		} else {
			_defaultSectionId = sectionId;
		}
	},
};

window.SpatialNavigation = SpatialNavigation;

/**********************/
/* CommonJS Interface */
/**********************/
if (typeof module === "object") {
	module.exports = SpatialNavigation;
}
