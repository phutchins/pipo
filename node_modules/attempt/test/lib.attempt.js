var attempt = require('../lib/attempt.js'),
	should = require('should');

describe('Attempt', function() {
	it('should handle successful callbacks', function(done) {
		attempt(
			function() {
				this(null, 'success');
			},
			function(err, success) {
				should.not.exist(err);
				should.exist(success);
				success.should.eql('success');
				done();
			});
	});
	it('should not retry successful callbacks', function(done) {
		var i = 0;
		attempt(
			function() {
				i++;
				this();
			},
			function() {
				i.should.eql(1);
				done();
			});
	});
	it('should handle error callbacks', function(done) {
		attempt(
			function() {
				this('Generic Error');
			},
			function(err) {
				should.exist(err);
				err.should.eql('Generic Error');
				done();
			});
	});
	it('should automatically retry on failure', function(done) {
		var i = 0;
		attempt(
			function() {
				i++;
				this('Generic Error');
			},
			function() {
				i.should.be.above(0);
				done();
			});
	});
	it('should catch exceptions', function(done) {
		attempt(
			function() {
				throw new Error('This should not be seen.');
			},
			function(err) {
				should.exist(err);
				err.should.be.an.instanceof(Error);
				err.message.should.eql('This should not be seen.');
				done();
			});
	});
	it('should retry the specified number of times', function(done) {
		var i = 0;
		attempt(
			{ retries: 2 },
			function() {
				i++;
				throw new Error('This should not be seen.');
			},
			function(err) {
				i.should.eql(3);
				done();
			});
	});
	it('should accept options as second argument', function(done) {
		var i = 0;
		attempt(
			function() {
				i++;
				throw new Error('This should not be seen.');
			},
			{ retries: 2 },
			function(err) {
				i.should.eql(3);
				done();
			});
	});
	it('should stop retrying when successful', function(done) {
		var i = 0;
		attempt(
			{ retries: 5 },
			function() {
				i++;
				if (i < 3)
					this('Generic Error');
				else
					this();
			},
			function(err) {
				should.not.exist(err);
				i.should.eql(3);
				done();
			});
	});
	it('should execute onError for error callbacks', function(done) {
		var i = 0;
		function onError() {
			i++;
		}
		attempt(
			{retries: 1, onError: onError },
			function() {
				this('Generic Error');
			},
			function() {
				i.should.eql(2);
				done();
			});
	});
	it('should wait to retry if onError triggers callback', function(done) {
		var i = 0;
		function onError(err, done) {
			process.nextTick(function() { i++; done(); });
		}
		attempt({ retries: 1, onError: onError },
			function() {
				if (i)
					this();
				else
					this('Generic Error');
			},
			function(err) {
				should.not.exist(err);
				done();
			});
	});
	it('should increment attempts with every attempt', function(done) {
		var i = 0;
		attempt(
			{ retries: 5 },
			function(attempts) {
				i.should.eql(attempts);
				i++;
				this('General Error');
			},
			function() {
				done();
			});
	});
	it('should wait the specified time before retrying', function(done) {
		var start = new Date().getTime(),
			end;
		attempt(
			{ retries: 1, interval: 20 },
			function(attempts) {
				if (attempts) {
					end = new Date().getTime();
					this();
				}
				else
					this('Generic Error');
			},
			function() {
				(end - start).should.be.above(15);
				done();
			});
	});
	it('should increase the interval by a set factor', function(done) {
		var start = new Date().getTime(),
			end1, end2;
		attempt(
			{ retries: 2, interval: 5, factor: 3 },
			function(attempts) {
				switch (attempts) {
					case 2: end2 = new Date().getTime(); break;
					case 1: end1 = new Date().getTime(); break;
				}
				this('Generic Error');
			},
			function() {
				(end2 - end1).should.be.above((end1 - start) * 2 - 1);
				(end2 - end1).should.be.below((end1 - start) * 4 + 1);
				done();
			});
	});
	it('should apply a max delay before next attempt', function(done) {
		var start = new Date().getTime(),
			end;
		attempt(
			{ retries: 1, interval: 4000, max: 5 },
			function(attempts) {
				if (attempts)
					end = new Date().getTime();
				this(!attempts);
			},
			function() {
				(end - start).should.be.below(4000);
				done();
			});
	});
	it('should not handle throwing in final callback', function(done) {
		var called = false;

		// replace mocha's uncaughtException handler temporarily
		var originalException = process.listeners('uncaughtException').pop();
		//Needed in node 0.10.5+
		process.removeListener('uncaughtException', originalException);
		process.once('uncaughtException', function (error) {
			process.listeners('uncaughtException').push(originalException);
			done();
		});

		attempt(
			function() {
				this(null, 'success');
			},
			function callback(err, success) {
				if (called) return done(new Error('Already called'));
				called = true;
				throw(new Error('Some Error'));
			});
	});
});