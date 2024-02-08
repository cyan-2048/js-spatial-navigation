/**
 * indicates the direction given by arrow keys or move() method.
 */
export type Direction = "up" | "down" | "left" | "right";

export type SpatialEventDetail = {
	/**
	 * indicates the direction given by arrow keys or move() method.
	 * @type {Direction} - "up" | "down" | "left" | "right"
	 */
	direction?: Direction;
	/**
	 * indicates the currently focused section.
	 */
	id?: string;
	/**
	 * indicate where the focus will be moved next.
	 */
	nextId?: string;
	/**
	 * indicate where the focus will be moved next.
	 */
	nextElement?: HTMLElement;
	/**
	 * indicates the last focused element before this move.
	 */
	previousElement?: HTMLElement;
	/**
	 * indicates whether this event is triggered by native focus-related events or not.
	 */
	native?: boolean;
	/**
	 * indicates why this move happens. 'keydown' means triggered by key events while 'api' means triggered by calling move()) directly.
	 */
	cause?: "keydown" | "api";
};

export type Rect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
	element: HTMLElement;
	center: {
		x: number;
		y: number;
		left: number;
		right: number;
		top: number;
		bottom: number;
	};
};

export type DistanceFunctions = {
	nearPlumbLineIsBetter: (rect: Rect) => number;
	nearHorizonIsBetter: (rect: Rect) => number;
	nearTargetLeftIsBetter: (rect: Rect) => number;
	nearTargetTopIsBetter: (rect: Rect) => number;
	topIsBetter: (rect: Rect) => number;
	bottomIsBetter: (rect: Rect) => number;
	leftIsBetter: (rect: Rect) => number;
	rightIsBetter: (rect: Rect) => number;
};

export type Priority = {
	group: Rect[];
	distance: ((rect: Rect) => number)[];
};

export type Priorities = Priority[];
