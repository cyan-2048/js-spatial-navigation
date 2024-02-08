import type {  Direction, DistanceFunctions, Priorities, Priority, Rect, SpatialEventDetail } from "./types";
import GlobalConfig from "./config"

/*****************/
/* Core Function */
/*****************/
const EVENT_PREFIX = "sn:";

export const getRect = (elem: HTMLElement): Rect | null => {
	const cr = elem.getBoundingClientRect();
	if (!cr) {
		return null;
	}
	const { left, top, right, bottom, width, height } = cr;
	const x = left + Math.floor(width / 2);
	const y = top + Math.floor(height / 2);
	const rect: Rect = {
		left: left,
		top: top,
		right: right,
		bottom: bottom,
		width: width,
		height: height,
		element: elem,
		center: {
			x: x,
			y: y,
			left: x,
			right: x,
			top: y,
			bottom: y,
		},
	};
	return rect;
};

export const partition = (rects: Rect[], targetRect: Rect, straightOverlapThreshold: number): Rect[][] => {
	const groups: Rect[][] = [[], [], [], [], [], [], [], [], []];
	for (let i = 0; i < rects.length; i++) {
		const rect = rects[i];
		const { center } = rect;
		let x = center.x < targetRect.left ? 0 : center.x <= targetRect.right ? 1 : 2;
		let y = center.y < targetRect.top ? 0 : center.y <= targetRect.bottom ? 1 : 2;
		const groupId = y * 3 + x;
		groups[groupId].push(rect);

		if ([0, 2, 6, 8].includes(groupId)) {
			if (rect.left <= targetRect.right - targetRect.width * straightOverlapThreshold) {
				groupId === 2 ? groups[1].push(rect) : groupId === 8 ? groups[7].push(rect) : null;
			}
			if (rect.right >= targetRect.left + targetRect.width * straightOverlapThreshold) {
				groupId === 0 ? groups[1].push(rect) : groupId === 6 ? groups[7].push(rect) : null;
			}
			if (rect.top <= targetRect.bottom - targetRect.height * straightOverlapThreshold) {
				groupId === 6 ? groups[3].push(rect) : groupId === 8 ? groups[5].push(rect) : null;
			}
			if (rect.bottom >= targetRect.top + targetRect.height * straightOverlapThreshold) {
				groupId === 0 ? groups[3].push(rect) : groupId === 2 ? groups[5].push(rect) : null;
			}
		}
	}
	return groups;
};

export const prioritize = (priorities: Priorities): Rect[] | null => {
	let destPriority: Priority | null = null;

	for (let i = 0; i < priorities.length; i++) {
		if (priorities[i].group.length) {
			destPriority = priorities[i];
			break;
		}
	}

	if (!destPriority) {
		return null;
	}

	const destDistance = destPriority.distance;

	destPriority.group.sort((a, b) => {
		for (let i = 0; i < destDistance.length; i++) {
			const distance = destDistance[i];
			const delta = distance(a) - distance(b);

			if (delta) {
				return delta;
			}
		}

		return 0;
	});

	return destPriority.group;
};

export const distanceBuilder = (targetRect: Rect): DistanceFunctions => {
	return {
		nearPlumbLineIsBetter: (rect: Rect) => {
			const d =
				rect.center.x < targetRect.center.x ? targetRect.center.x - rect.right : rect.left - targetRect.center.x;
			return d < 0 ? 0 : d;
		},
		nearHorizonIsBetter: (rect: Rect) => {
			const d =
				rect.center.y < targetRect.center.y ? targetRect.center.y - rect.bottom : rect.top - targetRect.center.y;
			return d < 0 ? 0 : d;
		},
		nearTargetLeftIsBetter: (rect: Rect) => {
			const d = rect.center.x < targetRect.center.x ? targetRect.left - rect.right : rect.left - targetRect.left;
			return d < 0 ? 0 : d;
		},
		nearTargetTopIsBetter: (rect: Rect) => {
			const d = rect.center.y < targetRect.center.y ? targetRect.top - rect.bottom : rect.top - targetRect.top;
			return d < 0 ? 0 : d;
		},
		topIsBetter: (rect) => rect.top,
		bottomIsBetter: (rect) => -1 * rect.bottom,
		leftIsBetter: (rect) => rect.left,
		rightIsBetter: (rect) => -1 * rect.right,
	};
};

export const navigate = (target: HTMLElement, direction: Direction, candidates: HTMLElement[], config: typeof GlobalConfig) => {
	if (!target || !direction || !candidates || !candidates.length) {
		return null;
	}

	const rects: Rect[] = [];
	const targetRect = getRect(target);

	if (!targetRect) return null;

	for (var i = 0; i < candidates.length; i++) {
		var rect = getRect(candidates[i]);
		if (rect) rects.push(rect);
	}
	if (!rects.length) return null;

	const distanceFunction = distanceBuilder(targetRect);
	const groups = partition(rects, targetRect, config.straightOverlapThreshold || 0.5);
	const internalGroups = partition(groups[4], targetRect, config.straightOverlapThreshold || 0.5);
	let priorities;

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

	if (config.straightOnly) priorities.pop();

	const destGroup = prioritize(priorities);
	if (!destGroup) return null;

	let dest: HTMLElement | null = null;
	if (
		config.rememberSource &&
		config.previous &&
		config.previous.destination === target &&
		config.previous.reverse === direction
	) {
		for (let j = 0; j < destGroup.length; j++) {
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
};

export const parseSelector = (selector: string | NodeList | HTMLElement): HTMLElement[] => {
	let result: HTMLElement[] = [];
	try {
		if (selector) {
			if (typeof selector === "string") {
				result = [].slice.call(document.querySelectorAll(selector));
			} else if (selector instanceof NodeList) {
				result = [].slice.call(selector);
			} else if (selector instanceof HTMLElement) {
				result = [selector];
			}
		}
	} catch (err) {
		console.error(err);
	}
	return result;
};

export const matchSelector = (elem: HTMLElement, selector: string | HTMLElement[] | HTMLElement): boolean => {
	if (!elem) return false;
	if (typeof selector === "string") {
		return elem.matches(selector);
	} else if (Array.isArray(selector)) {
		return selector.includes(elem);
	} else if (selector instanceof HTMLElement) {
		return elem === selector;
	}
	return false;
};

let _focusedElement: HTMLElement | null = null;

export function focusElement(el: HTMLElement | null) {
  _focusedElement = el;
}

export const getCurrentFocusedElement = (): HTMLElement | null => {
	return _focusedElement;
};

export const extend = (out, ...sources) => {
	return sources.reduce((result, source) => {
		Object.keys(source).forEach((key) => {
			if (source[key] !== undefined) {
				result[key] = source[key];
			}
		});

		return result;
	}, Object.assign({}, out));
};

export const exclude = (elemList, excludedElem) => {
	if (!Array.isArray(excludedElem)) {
		excludedElem = [excludedElem];
	}

	excludedElem.forEach((excluded) => {
		const index = elemList.indexOf(excluded);
		if (index >= 0) {
			elemList.splice(index, 1);
		}
	});

	return elemList;
};

export const dispatch = (elem: HTMLElement, type: string, details?: SpatialEventDetail, cancelable = true): boolean => {
	const evt = new CustomEvent(EVENT_PREFIX + type, { bubbles: true, cancelable, detail: details });
	return elem.dispatchEvent(evt);
};
