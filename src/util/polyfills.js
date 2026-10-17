// Small stand-ins for things older iPhones don't have yet (loaded before everything else).
// Object.hasOwn arrived in iOS 15.4; the Trystero matchmaker uses it.
if (!Object.hasOwn) Object.hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
