/**
 * Configure
 * mange conf file
 *
 * @constructor
 *
 **/
function Configure() {
}

/**
 * @const
 * @type {!string}
 */
Configure.confFilename = '../data/config.txt';

/**
 * @const
 * @type {!Array.<!string>}
 */
Configure.alwaysCheck = [];

/**
 * @const
 * @type {!Array.<!string>}
 */
Configure.defaultCheck = [];

/**
 * @type {boolean}
 */
Configure.initran = false;

/**
 * @type {!Object.<!string,*>}
 */
Configure.info = {};

/**
 * get
 * return value for this configuration value
 *
 * @param {!string} name
 * @param {boolean=} req
 * @return {*}
 **/
Configure.get = function(name, req) 
{
    if (!(name in Configure.info)) {
	if (req) throw new Error("Configure file doesn't contain '"+name+"'");
	return undefined;
    }
    return Configure.info[name];
};

/**
 * getString
 * return value for this configuration value
 *
 * @param {!string} name
 * @param {boolean=} req
 * @return {!string}
 **/
Configure.getString = function(name, req) 
{
    return (/** @type {!string} */ Configure.get(name, req));
};

/**
 * getNumber
 * return value for this configuration value
 *
 * @param {!string} name
 * @param {boolean=} req
 * @return {number}
 **/
Configure.getNumber = function(name, req) 
{
    var x = (/** @type {!number} */ Configure.get(name, req));
    if (typeof(x) == 'number') return x;
    return parseInt(x, 10);
};

/**
 * toString
 * return string rep of config options
 *
 * @return {!string}
 **/
Configure.toString = function()
{
    return JSON.stringify(Configure.info);
};

/**
 * initialized
 * return true if .init has been executed
 *
 * @return {boolean}
 **/
Configure.initialized = function()
{
    return Configure.initran;
};

/**
 * hasInfoOn
 * return true if we have information on the supplied key
 *
 * @param {!string} key
 * @return {boolean}
 **/
Configure.hasInfoOn = function(key)
{
    return key in Configure.info;
};

/**
 * require
 * make sure all elements in list are in conf file.
 *
 * @param {Array.<!string>} list
 * @return {number}
 **/
Configure.require = function(list)
{
    var err = 0;
    var len = list.length;
    for (var i=0; i<len; i++) {
	if (!Configure.hasInfoOn(list[i])) {
	    Util.error('conf file does NOT have "'+list[i]+'"');
	    err++;
	}
    }
    if (err > 0) {
	Util.error('Exiting because conf file fails');
	Util.exit(-1);
    }
    return err;
}

/**
 * init
 *
 * Synchronously reads a configuration file containing things like basepath, baseurl, and
 * port information.
 *
 * @param{!string=} filepath
 * @param{!Array.<!string>=} checkfor
 */
Configure.init = function(filepath, checkfor){
   //check if the fs module has been imported under the correct name;
    fs = (/** @type {function(new:fs)} */ require('fs'));
   // setup arguments
    filepath = filepath || Configure.confFilename;
    checkfor = checkfor || Configure.defaultCheck;

    checkfor = checkfor.concat(Configure.alwaysCheck);
    try {
	var sinfo = (/** @type {!string} */ fs.readFileSync(filepath));
	Configure.info = (/** @type {!Object} */ (JSON.parse(sinfo)));
	var fail = false;
	for (var i in checkfor) {
            if (Configure.info[checkfor[i]] === undefined) {
		console.log(checkfor[i] + ' expected to be in ' + filepath + ' but was not');
		fail = true;
            }
	}
	if (fail) {
            Util.exit(101);
	}
	Configure.initran = true; // mark as inited
    } catch(e) {
	Util.error(e);
	Util.error('failed to read the config file. perhaps the json is misformed or it is not there?');
	Util.exit(102);
    }
};

module.exports = Configure;

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
