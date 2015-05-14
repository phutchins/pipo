/*
 Copyright (c) 2012-2013 Tom Frost <tom@frosteddesign.com>

 MIT License

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

/**
 * Attempts to execute a function, retrying it with a variety of customizations
 * if the function throws an error or calls back with a non-empty first
 * argument.
 *
 * The options object and the tryFunc can be passed in any order.  The last
 * argument must be the callback function (if a callback is necessary).
 *
 * @param {Object} [options] Optional collection of configuration values.  See
 *      attempt.defaults for a full listing of available options.
 * @param {Function} tryFunc The function to be executed.  In order for Attempt
 *      to proceed, the tryFunc must call this() with its result.  If the
 *      tryFunc throws an exception or returns a non-false first argument, it
 *      will be considered a failure and will be retried per the configuration.
 *      This function will be called with the following argument:
 *          - {Number} attempts: The number of times this function has been
 *            called, 0-indexed.
 * @param {Function} [callback] Optional function to be called once tryFunc is
 *      either successful or has reached its maximum retry times.  The first
 *      argument given to this function will always be an error value, if an
 *      error occurred.
 */
function attempt(options, tryFunc, callback) {
	// Detect if options and tryFunc were swapped
	if (typeof options == 'function') {
		var opts = tryFunc;
		tryFunc = options;
		options = opts;
	}
	// Find the callback if options was omitted
	if (typeof options == 'function') {
		callback = options;
		options = {};
	}
	// Exit if we're done
	if (options.retries && options.retries < 0) {
		if (!options.lastError)
			throw new Error('Cannot attempt() with retries < 0.');
		if (callback) callback(options.lastError);
	}
	else {
		// Combine the options with the defaults
		options = attempt.shallowMerge(attempt.defaults, options);
		// Runs another attempt, with one fewer retry
		function runAgain(respectInterval) {
			if (respectInterval && options.retries && options.interval) {
				var timeout = Math.min(
					(1 + options.random * Math.random()) *
						options.interval *
						Math.pow(options.factor, options.attempts),
					options.max);
				setTimeout(runAgain, timeout);
			}
			else {
				options.retries--;
				options.attempts++;
				attempt(tryFunc, options, callback);
			}
		}
		// Called when an error is reached
		function handleError(err) {
			options.lastError = err;
			if (options.onError) {
				if (options.onError.length > 1)
					options.onError(err, runAgain);
				else {
					options.onError(err);
					runAgain(true);
				}
			}
			else
				runAgain(true);
		}
		// Define the 'this' context for the attempted call
		function assess() {
			var args = Array.prototype.slice.call(arguments);
			if (args[0]) {
				handleError(args[0]);
			} else if (callback) {
				setTimeout(function() {
					callback.apply(null, args);
				}, 0);
			}
		}
		// Call it cap'n.
		try {
			tryFunc.call(assess, options.attempts);
		}
		catch (e) {
			handleError(e);
		}
	}
}

/**
 * An object defining the default configuration values for each attempt.
 * @type {Object}
 */
attempt.defaults = {
	/**
	 * The number of times the function can be retried if it continues to fail.
	 * @type {Number}
	 */
	retries: 2,

	/**
	 * An optional function to be called whenever the attempted function fails.
	 * If this function needs to do asynchronous work before another attempt is
	 * made, it can accept an argument called 'done', which is a function to be
	 * called when it's ready for another attempt.  Call done() to execute the
	 * next attempt immediately, or done(true) to observe the interval before
	 * executing the next attempt.
	 * @type {Function}
	 */
	onError: null,

	/**
	 * The number of milliseconds to wait between attempts.
	 * @type {Number}
	 */
	interval: 0,

	/**
	 * The factor by which the interval should be multiplied per attempt.  If
	 * set to 2 with an interval of 5, the first retry will execute after 5
	 * seconds, the second after 10, the third after 20, and so on.
	 * @type {Number}
	 */
	factor: 1,

	/**
	 * The number of attempts to fake Attempt into believing were already
	 * completed.  This is mostly used by Attempt internally, but can be useful
	 * for hacking interval times.
	 * @type {Number}
	 */
	attempts: 0,

	/**
	 * The maximum number of milliseconds to wait before retrying.  If the
	 * interval or factor causes a wait time larger than 'max', 'max' will
	 * be used.
	 * @type {Number}
	 */
	max: Infinity,

	/**
	 * Increase the wait interval by a random factor. Generally, this should be
	 * a number between 0 (no randomness) and 1 (wait time could double).  For
	 * example, if .5 is used, the interval could be anywhere between 100% and
	 * 150% of its original calculated time.
	 * @type {Number}
	 */
	random: 0
};

/**
 * Compiles a shallow merge of all provided arguments, in order.  Each
 * additional object's fields will overwrite the previous objects'.
 *
 * @return {Object} A merged Object.
 */
attempt.shallowMerge = function() {
	var args = Array.prototype.slice.call(arguments),
		result = {};
	args.forEach(function(obj) {
		for (var prop in obj) {
			if (obj.hasOwnProperty(prop))
				result[prop] = obj[prop];
		}
	});
	return result;
};

// Hook into CommonJS systems.
if (typeof module !== 'undefined' && 'exports' in module) {
	module.exports = attempt;
}
