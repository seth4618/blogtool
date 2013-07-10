////////////////////////////////////////////////////////////////
// class to support generation scavanging for db objects
////////////////////////////////////////////////////////////////

var Util = require('./util.js');

/**
 * GenCache
 * keep track of ids of records
 *
 * @constructor
 * @param {!string} name
 * @param {function(new:DatabaseBackedObject)} cls
 * @param {number} period	number of seconds for each generation.  0 means lives forever
 **/
function GenCache(name, cls, period) 
{
    this.all = {};
    this.oldall = {};
    this.cls = cls;
    this.description = name;
    this.period = 0;
    this.resetPeriod(period);
    this.toObjectId = GenCache.toObjectId;
}

GenCache.toObjectId = function(s) {
    if (typeof s == 'string')
		return new db.connection.bson_serializer.ObjectID(s);
	Util.assert(!(s == undefined), "s is undefined??");
    return (/** @type {!DBID} */ s);
}

/** @type {number} */ GenCache.intervalId = 0;
/** @type {number} */ GenCache.watchdogSeconds = 15;
/** @type {!Array.<!GenCache>} */ GenCache.list = [];

/** @type {!Object.<!string,!DatabaseBackedObject>} */ GenCache.prototype.all;
/** @type {!Object.<!string,!DatabaseBackedObject>} */ GenCache.prototype.oldall;
/** @type {!string} */ GenCache.prototype.description;
/** @type {number} */ GenCache.prototype.period;
/** @type {number} */ GenCache.prototype.countDown;

/**
 * find
 * find in this directory.  return non-null if found, otherwise null
 *
 * @param {!string} id
 * @return {DatabaseBackedObject|null}
 **/
GenCache.prototype.find = function(id)
{
    if (id in this.oldall) {
        this.all[id] = this.oldall[id];
        delete this.oldall[id];
    }
    if (id in this.all) {
        return this.all[id];
    }
    return null;
};

/**
 * sfind
 * find in this directory.  return non-null if found, otherwise null
 *
 * @param {!string} id
 * @return {Object|null}
 **/
GenCache.prototype.sfind = function(id)
{
    if (id in this.oldall) {
        this.all[id] = this.oldall[id];
        delete this.oldall[id];
    }
    if (id in this.all) {
	    return (this.all[id]);
    }
    return null;
};

/**
 * erase
 * remove id from old and new.  User has ensured this is safe.  If not found, do nothing
 *
 * @param {!string} id
 **/
GenCache.prototype.erase = function(id)
{
    if (id in this.oldall) {
        delete this.oldall[id];
    }
    if (id in this.all) {
        delete this.all[id];
    }
};

/**
 * forAllCurrent
 * return all current ids in this directory
 *
 * @param {function(!string)} iter
 **/
GenCache.prototype.forAllCurrent = function(iter)
{
    for (var id in this.all) {
        iter(id);
    }
};

/**
 * forAllOldAndNew
 * return all ids in this directory, including ones in prev generation
 *
 * @param {function(!string)} iter
 **/
GenCache.prototype.forAllOldAndNew = function(iter)
{
    var id;
    for (id in this.all) {
        iter(id);
    }
    for (id in this.oldall) {
        iter(id);
    }
};

/**
 * resetPeriod
 * change scavanging period to num seconds, 0 means don't do it
 *
 * @param {number} num
 **/
GenCache.prototype.resetPeriod = function(num)
{
    var currentlyScavanged = (this.period > 0);
    if (num > 0) {
        // scavange this every num seconds
        this.period = num/GenCache.watchdogSeconds;
        this.countDown = this.period;
        if ((this.period != 0)&&(!currentlyScavanged)) GenCache.list.push(this); // only put ones being scavanged on list
    } else {
        // don't scavange this one anymore
        this.period = 0;
        this.countDown = 0;
        if (currentlyScavanged) {
            var i;
            var len = GenCache.list.length;
            for (i=0; i<len; i++) {
                if (GenCache.list[i] == this) {
                    // remove it from this position
                    GenCache.list.splice(i, 1);
                    break;
                }
            }
            Util.assert(i < len, "tried to remove "+this.description+" from scavange list, but not found");
        }
    }
};

/**
 * startWatchdog
 * start watchdog timer on user
 *
 **/
GenCache.startWatchdog = function() {
    GenCache.intervalId = setInterval(GenCache.watchdog, GenCache.watchdogSeconds*1000);
};

/**
 * stopWatchdog
 * start watchdog timer on user
 *
 **/
GenCache.stopWatchdog = function() {
    if (GenCache.intervalId == 0) return;
    clearInterval(GenCache.intervalId);
    GenCache.intervalId = 0;
};

/**
 * watchdog
 * @private
 *
 * swap generations
 *
 **/
GenCache.watchdog = function() {
    var i;
    var len = GenCache.list.length;
    for (i=0; i<len; i++) {
        var gc = GenCache.list[i];
        Util.assert(gc.period > 0, "how get to gencache watchdog with 0 period");
        // see if this one require's scavanging
        if (gc.countDown-- > 0) continue;

        // lets do it
        gc.countDown = gc.period;
        var dropping = gc.oldall;
        gc.oldall = gc.all;
        gc.all = {};
        var count = 0;
        for (var id in dropping) {
            count++;
            var item = dropping[id];
            item.deleteMe();
        }
        if (count > 0) Util.info("gencache:"+gc.description+" Dropping: "+count);
    }
};

GenCache.startWatchdog();

module.exports = GenCache;

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
