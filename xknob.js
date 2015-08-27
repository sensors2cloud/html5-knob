'use strict';

if (!window.XKnob) {
	(function() {

		// Convenience functions to sanitize numbers.
		var float_or_default = function(x, def) {
			x = parseFloat(x);
			return isNaN(x) ? def : x;
		};
		var int_or_default = function(x, def) {
			x = parseInt(x, 10);
			return isNaN(x) ? def : x;
		};

		////////////////////
		// Global internal variables for UI handling.

		// A XKnob element if one is being dragged right now.
		//
		// Limitation: only one can be changed at the same time.
		//
		// This limitation is not a problem on mouse-driven interfaces, as
		// there is only a single mouse (well, on most systems anyway).
		//
		// For multi-touch interfaces, this code should be rewritten to support
		// multiple knobs being changed at the same time.
		var xknob_being_dragged = null;

		// The mouse (or touch) angle from the last event. Used to calculate
		// the direction (CW or CCW).
		var xknob_drag_previous_angle = null;

		// The (proposed, before applying min/max/divisions) value from the
		// last event.
		var xknob_drag_previous_value = null;

		// The initial value upon starting to drag the knob. Used to decide if
		// 'change' event should be fired.
		var xknob_drag_initial_value = null;

		////////////////////
		// Event handling functions.

		var add_listeners_to_document = function(elem) {
			if (elem instanceof HTMLElement) {
				elem = elem.ownerDocument;
			}
			// Duplicate event listeners are discarded.
			elem.addEventListener('mouseup', stop_dragging);
			elem.addEventListener('mousemove', drag_rotate);
			elem.addEventListener('touchend', stop_dragging);
			elem.addEventListener('touchmove', drag_rotate);
		}
		var remove_listeners_from_document = function(elem) {
			if (elem instanceof HTMLElement) {
				elem = elem.ownerDocument;
			}
			elem.removeEventListener('mouseup', stop_dragging);
			elem.removeEventListener('mousemove', drag_rotate);
			elem.removeEventListener('touchend', stop_dragging);
			elem.removeEventListener('touchmove', drag_rotate);
		}

		// Should be attached to '.knob_gfx'.
		var start_dragging = function(ev) {
			remove_listeners_from_document(ev.target);
			xknob_being_dragged = null;

			// Only handling clicks with the left mouse button.
			if (ev.type === 'mousedown' && ev.button !== 0) {
				return;
			}

			// Finding the XKnob element.
			// ev.target is where the event was originated.
			// ev.currentTarget is where the event listener was attached.
			var shadow_root = ev.currentTarget;
			while (shadow_root && !(shadow_root instanceof ShadowRoot)) {
				shadow_root = shadow_root.parentNode;
			}
			if (!shadow_root) return;
			var xknob = shadow_root.host;
			if (!xknob) return;

			// Actual event handling.
			ev.preventDefault();
			ev.stopPropagation();
			xknob_being_dragged = xknob;
			xknob_drag_previous_angle = xknob._get_mouse_angle(ev);
			xknob_drag_previous_value = xknob.value;
			xknob_drag_initial_value = xknob.value;

			add_listeners_to_document(xknob);
		}

		// Should be attached to the document, because this event may happen
		// outside of XKnob.
		var stop_dragging = function(ev) {
			if (!xknob_being_dragged) {
				remove_listeners_from_document(ev.target);
				return;
			}

			if (xknob_drag_initial_value !== xknob_being_dragged.value) {
				xknob_being_dragged.dispatchEvent(new Event('change', {
					'bubbles': true,
					'cancelable': false
				}));
			}

			remove_listeners_from_document(ev.target);
			xknob_being_dragged = null;
		}

		// Should be attached to the document, because this event may happen
		// outside of XKnob.
		var drag_rotate = function(ev) {
			if (!xknob_being_dragged) {
				remove_listeners_from_document(ev.target);
				return;
			}

			var new_angle = xknob_being_dragged._get_mouse_angle(ev);
			var old_angle = xknob_drag_previous_angle;
			xknob_drag_previous_angle = new_angle;

			var delta_angle = new_angle - old_angle;
			if (delta_angle < 0) {
				// Because this is a circle
				delta_angle += Math.PI * 2;
			}
			if (delta_angle > Math.PI) {
				// Converting from 0..360 to -180..180.
				delta_angle -= Math.PI * 2;
			}
			console.assert(delta_angle >= -Math.PI && delta_angle <= Math.PI, {'delta_angle': delta_angle, 'old_angle': old_angle, 'new_angle': new_angle});

			var delta_value = delta_angle / Math.PI / 2;
			var new_proposed_value = xknob_drag_previous_value + delta_value;
			xknob_drag_previous_value = new_proposed_value;

			var old_actual_value = xknob_being_dragged.value;
			xknob_being_dragged.value = new_proposed_value;
			var new_actual_value = xknob_being_dragged.value;
			if (old_actual_value !== new_actual_value) {
				xknob_being_dragged.dispatchEvent(new Event('input', {
					'bubbles': true,
					'cancelable': false
				}));
			}
		}

		////////////////////
		// The actual XKnob object.
		var XKnob = document.registerElement('x-knob', {
			'prototype': Object.create(HTMLElement.prototype, {
				'createdCallback': {
					'value': function() {
						// Default values for private vars.
						this._divisions = 0;
						this._min = null;
						this._max = null;
						this._svgusehref = null;
						this._value = 0;

						// Setting values from attributes.
						for (var attr of ['divisions', 'min', 'max', 'svgusehref', 'value']) {
							if (this.hasAttribute(attr)) {
								this[attr] = this.getAttribute(attr);
							}
						}

						if (this._svgusehref === null) {
							this._update_innerHTML();
						}
					}
				},
				'attributeChangedCallback' : {
					'value': function(attrName, oldVal, newVal) {
						attrName = attrName.toLowerCase();
						if (['divisions', 'min', 'max', 'svgusehref', 'value'].indexOf(attrName) > -1) {
							this[attrName] = newVal;
						}
					}
				},

				// HTMLInputElement-inspired properties.
				// Upon getting, returns a number (or null) instead of a string.
				'divisions': {
					'get': function() {
						return this._divisions;
					},
					'set': function(x) {
						this._divisions = int_or_default(x, 0);
						this._update_value();
					}
				},
				'min': {
					'get': function() {
						return this._min;
					},
					'set': function(x) {
						this._min = float_or_default(x, null);
						this._update_value();
					}
				},
				'max': {
					'get': function() {
						return this._max;
					},
					'set': function(x) {
						this._max = float_or_default(x, null);
						this._update_value();
					}
				},
				'svgusehref': {
					'get': function() {
						return this._svgusehref;
					},
					'set': function(x) {
						this._svgusehref = '' + x;
						this._update_innerHTML();
					}
				},
				'value': {
					'get': function() {
						return this._value;
					},
					'set': function(x) {
						this._value = float_or_default(x, 0);
						this._update_value();
					}
				},

				'_update_innerHTML': {
					'value': function() {
						if (!this.shadowRoot) {
							this.createShadowRoot();
						}
						if (this._svgusehref) {
							this.shadowRoot.innerHTML = '' +
								'<svg viewBox="-1 -1 2 2" style="display: block; width: 100%; height: 100%;">' +
								'  <circle class="knob_center" cx="0" cy="0" r="0.015625" fill="none" opacity="0" pointer-events="none" />' +
								'  <use class="knob_gfx" xlink:href="' + encodeURI(this._svgusehref) + '" x="0" y="0" width="2" height="2">' +
								'  </g>' +
								'</svg>';
						} else {
							this.shadowRoot.innerHTML = '' +
								'<svg viewBox="-6 -6 12 12" style="display: block; width: 100%; height: 100%;">' +
								'  <circle class="knob_center" cx="0" cy="0" r="0.015625" fill="none" opacity="0" pointer-events="none" />' +
								'  <g class="knob_gfx">' +
								'    <circle cx="0" cy="0" r="5" stroke="#2e3436" fill="#babdb6" stroke-width="0.25"/>' +
								'    <line x1="0" y1="-1.25" x2="0" y2="-4.5" stroke="#2e3436" stroke-width="0.5px" stroke-linecap="round"/>' +
								'  </g>' +
								'</svg>';
						}

						this.shadowRoot.querySelector('.knob_gfx').addEventListener('mousedown', start_dragging);
						this.shadowRoot.querySelector('.knob_gfx').addEventListener('touchstart', start_dragging);
						this._update_gfx_rotation();
					}
				},
				'_update_value': {
					'value': function() {
						// Sanity check.
						if (!Number.isFinite(this._value)) {
							this._value = 0;
						}

						// Snapping to one of the circle divisions.
						if (Number.isFinite(this._divisions) && this._divisions >= 2) {
							this._value = Math.round(this._value * this._divisions) / this._divisions;
						}

						// Clamping to the defined min..max range.
						if (Number.isFinite(this._max) && this._value > this._max) {
							this._value = this._max;
						}
						if (Number.isFinite(this._min) && this._value < this._min) {
							this._value = this._min;
						}
						this._update_gfx_rotation();
					}
				},
				'_update_gfx_rotation': {
					'value': function() {
						if (this.shadowRoot) {
							var elem = this.shadowRoot.querySelector('.knob_gfx');
							if (elem) {
								elem.style.transform = 'rotate(' + (this._value * 360) + 'deg)';
							}
						}
					}
				},

				'_get_center_position': {
					'value': function() {
						// Invisible element used to get the X,Y coordinates.
						var rect = this.shadowRoot.querySelector('.knob_center').getBoundingClientRect();
						return [
							rect.left + (rect.right - rect.left) / 2,
							rect.top + (rect.bottom - rect.top) / 2
						];
					}
				},

				'_get_mouse_angle': {
					'value': function(ev) {
						var center = this._get_center_position();

						// Mouse position.
						var cursor = [ev.clientX, ev.clientY];

						// Or finger touch position.
						if (ev.targetTouches && ev.targetTouches[0]) {
							cursor = [ev.targetTouches[0].clientX, ev.targetTouches[0].clientY];
						}

						var rad = Math.atan2(cursor[1] - center[1], cursor[0] - center[0]);
						rad += Math.PI / 2;

						return rad;
					}
				},
			})
		});

		window.XKnob = XKnob;
	})();
}
