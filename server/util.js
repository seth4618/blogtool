////////////////////////////////////////////////////////////////
// various extern defs, files, etc.

function Util() {}
Util.abort = function(s) { console.log(""+s); throw new Error(s); };
Util.ggConsole = function(s) { console.log(""+s); };
Util.needcr = 0;
Util.formatDate = function(d) {
	function digits(x) {
		if (x < 10) return "0"+x;
		return x;
	}
	return  d.getFullYear()+"/"+digits((d.getMonth()+1))+"/"+digits(d.getDate())+" "+digits(d.getHours())+":"+digits(d.getMinutes())+":"+digits(d.getSeconds());
};
Util.memoryCount = 0;
Util.logCount = 100;
Util.startTime = (new Date()).getTime();
Util.log = function(s) {
	if (Util.needcr) {
		process.stdout.write('\n');
		Util.needcr = 0;
	}
	var d = new Date();
	var dd = d.getTime()-Util.startTime;
	console.log(dd+s);
	if (Util.logCount-- < 1) {
		Util.logCount = 500;
		if (Util.memoryCount-- < 1) {
			console.log(dd+" Time is: "+Util.formatDate(d)+" "+JSON.stringify(process.memoryUsage()));
			Util.memoryCount = 10;
		} else {
			console.log(dd+" Time is: "+Util.formatDate(d));
		}
	}
};
Util.infocnt = 0;
Util.errcnt = 0;
Util.info = function(s) {
	Util.infocnt++;
	Util.log(" Info:"+s);
};
/** @type {number} */ Util.debugcalls = 0;
Util.debug = function(v, s) {
	if (v >= verboseLevel) {
		Util.debugcalls++;
		return;
	}
	Util.log(" Debug:"+s);
};
Util.warning = function(s) {
	Util.log(" Warn:"+s);
};
Util.error = function(s) {
	Util.errcnt++;
	Util.log(" Error:"+s);
};
Util.req = function(s) {
	if (s == '') {
		process.stdout.write('.');
		Util.needcr = 1;
		return;
	} 
	Util.info("R:"+s);
};
Util.exit = function(code) {
	var ok = 0;
	process.stdout.on('drain', function closure_util_66() { ok++; if (ok == 1) process.exit(code); });
	process.stdout.write("Exiting\n");
};

/**
 * deprecated
 *
 * @param {string=} s
  **/
Util.deprecated = function(s) {
	var msg = "Deprecated:"+(s || "");
	Util.error(msg);
	throw new Error(msg);
};

/**
 * ndy
 * not done yet
 *
 * @param {!string=} s
 **/
Util.ndy = function(s) {
	var msg = "Not Done Yet:"+(s || "");
	Util.error(msg);
	throw new Error(msg);
};

/**
 * showStack
 * show stack for debugging
 *
 * @param {!string} msg
 **/
Util.showStack = function(msg)
{
	var e = new Error("Showing Stack");
	Util.error(msg+e.stack);
};


/**
 * assert
 *
 * @param {*} x					assertion to evalute. if true, do nothing
 * @param {!string=} msg		msg to output if x is false
 */
Util.assert = function(x, msg) {
    if (!!x) return;
    msg = msg ? msg : 'failed assert with no message';
    msg = 'FAILED ASSERT: ' + msg;
    Util.error(msg);
	throw new Error('Assertion fails: '+msg);
}


/**
 * foreach
 * call callback once each element in collection, passing in collection and the key
 *
 * @param {(!Object|!Array)} collection
 * @param {function(!(string|number))} cb
 **/
Util.foreach = function(collection, cb)
{
	var key;
	for (key in collection) {
		cb(key);
	}
};

/**
 * inherits
 *
 * COPIED from nodejs util.js exports.inherits.  Copy here for compiler type checker
 * 
 * @param {Object} ctor
 * @param {Object} superCtor
 * @return {undefined}
 **/
Util.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}

/**
 * trim
 * removing leading and trailing whitespace
 */
Util.trim = function(str){
    str = str.replace(/^\s*[^\s]/, '');
};


/**
 * isEmptyObj
 *
 * Returns false if object with no keys or empty array.
 *
 * Implemented because the following does not work: 
 *  var tmp = {};
 *  tmp == {}; //evaluates to false
 *
 * @param {!Object} obj
 * @return {boolean}
 */
Util.isEmptyObj = function(obj){
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            return false;
        }
    }
    return true;
};

/**
 * coundObjKeys
 *
 * Counts the number of key / value pairs in an object.
 * NOTE : this function does not user hasOwnProperty
 *
 * @param {!Object} obj
 * @return {number}
 */
Util.countObjKeys = function(obj){
    var count = 0;
    for (var i in obj) {
        count++;
    }
    return count;
};

module.exports = Util;

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
