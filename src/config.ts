import { Direction } from "./types";

const config = {
	// selector: "", // can be a valid <extSelector> except "@" syntax.
	straightOnly: false,
	straightOverlapThreshold: 0.5,
	rememberSource: false,
	disabled: false,
	defaultElement: "", // <extSelector> except "@" syntax.
	enterTo: "", // '', 'last-focused', 'default-element'
	leaveFor: null, // {left: <extSelector>, right: <extSelector>,
	//  up: <extSelector>, down: <extSelector>}
	restrict: "self-first", // 'self-first', 'self-only', 'none'

	// tabIndexIgnoreList: "a, input, select, textarea, button, iframe, [contentEditable=true]",
	// navigableFilter: null,

	previous: undefined as
		| {
				target: HTMLElement;
				destination: HTMLElement;
				reverse: Direction;
		  }
		| undefined,
};

export default config;
