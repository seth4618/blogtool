// a higher level interface to the db

var mdb = require('./mdb.js');
var MongoDB = mdb.MongoDB;
var GenCache = require('./gencache.js');

/**
 * DatabaseBackedObject
 *
 * @constructor
 **/
function DatabaseBackedObject() {}

/**
 * arrayToDB
 * helper function to take an array of objects and put their ids in an array.
 *
 * @param {!Array} dest
 * @param {!Array.<DatabaseBackedObject>} src
 * @return {!Array}
 **/
DatabaseBackedObject.arrayToDB = function(dest, src) 
{
    var i;
    var len;

	Util.assert(!(src == undefined), "arraytodb where src is undefined");
    len = src.length;
    for (i=0; i<len; i++) {
        dest.push(src[i].getIDforDB());
    }
    return dest;
};

/**
 * ObjectIdsToDB
 * helper function to take a hash of objects and put their ids in an array.
 *
 * @param {!Array} dest
 * @param {!Object.<!string,!DatabaseBackedObject>} src
 * @return {!Array}
 **/
DatabaseBackedObject.objectIdsToDB = function(dest, src) 
{
    var i;

	Util.assert(!(src == undefined), "objectidstodb where src is undefined");
	for (i in src) {
		dest.push(src[i].getIDforDB());
    }
    return dest;
};

/**
 * arrayToJS
 * help function to take an array of objects and put there ids in an array
 *
 * @param {function(new:DatabaseBackedObject)} cls
 * @param {!Array.<!DBID>} src
 * @param {!DatabaseBackedObject} obj
 * @param {!string} field
 * @param {!Synchronizer} synch
 **/
DatabaseBackedObject.arrayToJS = function(cls, src, obj, field, synch) 
{
    var i;
    var len = src.length;
    synch.wait(len);

    obj[field] = [];
    for (i=0; i<len; i++) {
        cls.find(src[i], function(p) { obj[field].push(p); synch.done(1); });
    }
};

/**
 * arrayToHash
 * help function to take an array of object ids and create a hash of ids->objects
 *
 * @param {function(new:DatabaseBackedObject)} cls
 * @param {!Array.<!DBID>} src
 * @param {!DatabaseBackedObject} obj
 * @param {!string} field
 * @param {!Synchronizer} synch
 **/
DatabaseBackedObject.arrayToHash = function(cls, src, obj, field, synch) 
{
    var i;
    synch.wait(1);

    obj[field] = [];
    for (i in src) {
		synch.wait(1);
		cls.find(src[i], function xx1(p) { obj[field][p.id] = p; synch.done(1); });
    }
	synch.done(1);
};

/**
 * findPossibleDelayHelper
 *
 * find the object related to this id.  We expect this to be in db.
 * so, if not found it might be delayed, so try again.  if never
 * found, call errcb
 *
 * @param {!(string|DBID)} id
 * @param {!function(DatabaseBackedObject)} okcb
 * @param {!function()} errcb
 * @param {number} delay
 * @param {number} tries
 * @param {function(new:DatabaseBackedObject)} cls
 **/
DatabaseBackedObject.findPossibleDelayHelper = function(id, okcb, errcb, delay, tries, cls) 
{
    cls.find(id, function (obj) {
            if (obj != null) { okcb(obj); return }
            if (tries < 4) {
                setTimeout(function closure_mdb_948() {
                        DatabaseBackedObject.findPossibleDelayHelper(id, okcb, errcb, delay, tries+1, cls);
                    }, delay+(tries*50));
            } else {
                errcb();
            }
        });
};

/**
 * find
 * find the user related to this id
 *
 * @param {!(string|DBID)} id
 * @param {function(DatabaseBackedObject)} cb
 **/
DatabaseBackedObject.find = function(id, cb) {
    Util.error("defaulted to DBO, this should be in subclass");
};

/**
 * convertToDB
 * convert an object into a record.  This is the default case where there is nothing special to do
 *
 * @param {!function(!Object)} cb
 * @param {Array.<!string>=} using
 **/
DatabaseBackedObject.prototype.convertToDB = function(cb, using)
{
    var record = {};
    if (using == undefined) {
        // get all fields
        // warning: this will not work with fields that have been inherited
        for (var f in this) {
            record[f] = this[f];
        }
    } else {
        // only get the fields specified
        var i;
        var len = using.length;
        for (i=0; i<len; i++) {
            var f = using[i];
            record[f] = this[f];
        }
    }

    if (this._id) {
        record._id = this._id;
    }
    cb(record);
};

/**
 * convertFromDB
 * convert a record into an object.  This is the default case where there is nothing special to do.
 *
 * @param {!Object} record
 * @param {function(DatabaseBackedObject)=} cb	if specified, call back when conversion is done
 **/
DatabaseBackedObject.prototype.convertFromDB = function(record, cb)
{
    for (var f in record) {
		this[f] = record[f];
	}
    if (cb == undefined) return;
    cb(this);
};

/**
 * afterInsert
 * called after insertion, i.e., we now have an id
 *
 **/
DatabaseBackedObject.prototype.afterInsert = function()
{
};

/**
 * get the id for the database
 * @return {DBID}
 *
 **/
DatabaseBackedObject.prototype.getIDforDB = function()
{
    return this._id;
};


/**
 * tell item it is being deleted from memory
 *
 **/
DatabaseBackedObject.prototype.deleteMe = function()
{
};

// extend MongoDB to handle DatabaseBackedObject functions

/**
 * find
 * find one record by its id
 *
 * will throw ExpectedOneRecord error if number of results doesn't equal exactly 1
 *
 * @param {!string} table
 * @param {!string} id
 * @param {!GenCache} cache
 * @param {!function(DatabaseBackedObject)} cb
 * @param {!function()=} errcb
 **/
MongoDB.prototype.find = function(table, id, cache, cb, errcb) 
{
    //SLOWvar src = new Error('find in '+table+' for '+id);
    var sid = id+"";
    if (sid in cache.oldall) {
        cache.all[sid] = cache.oldall[sid];
        delete cache.oldall[sid];
    }
    if (sid in cache.all) {
		var obj = cache.all[sid];
		if ("_id" in obj) {
			// we have gotten this and gotten back from the db
			cb(obj);
		} else {
			// someone else asked for this id, but it hasn't come back from the DB yet
			if (!('waiting' in obj)) {
				obj.waiting = [];
			}
			//Util.info("waiting for "+id+" of "+table+" to return from the DB");
			obj.waiting.push(cb);
		}
		return;
    }
    var obj = new cache.cls();
    cache.all[sid] = obj;
    var me = this;
    this.stashError(errcb, obj)
    try {
		this.query(table, {_id: cache.toObjectId(id)}, cache, function closure_mdb_290(dobj) {
                // we got back a result
                me.eraseError(obj);
                // if the return object is null we need to deal with the waiting issue
                if (dobj == null) {
                    if ('waiting' in obj) {
                        Util.error('null returned for '+table+'('+sid+') and has waiters');
                        //SLOW Util.error('null returned for '+table+'('+sid+') and has waiters\n'+src.stack);
                        var waiters = obj.waiting;
                        delete cache.all[sid];
                        // call them back with null
                        var i;
                        var len = waiters.length;
                        for (i=0; i<len; i++) {
                            waiters[i](dobj);
                        }
                    } else {
                        Util.error('null returned for '+table+'('+sid+')');
                        //SLOWUtil.error('null returned for '+table+'('+sid+')\n'+src.stack);
                        delete cache.all[sid];
                    }
                }
                cb(dobj);
            }, 1);
    } catch (err) {
		delete cache.all[sid];
		Util.error("Did find by id ("+id+") in "+table+" and got an error, remove the obj from .all: "+err);
        Util.error(err.stack);
        // call error function if available
        if (errcb == undefined) throw err;
        errcb();
    }
};

/**
 * refind
 * find one record by its id and if already in cache, replace fields in same object with the new data from the db
 *
 * will throw ExpectedOneRecord error if number of results doesn't equal exactly 1
 *
 * @param {!string} table
 * @param {!string} id
 * @param {!GenCache} cache
 * @param {!function(DatabaseBackedObject)} cb
 **/
MongoDB.prototype.refind = function(table, id, cache, cb) 
{
    var sid = id+'';
    if (sid in cache.oldall) {
        cache.all[sid] = cache.oldall[sid];
        delete cache.oldall[sid];
    }
    if (sid in cache.all) {
		var obj = cache.all[sid];
    } else {
        // this id is not in the db, do a normal find
        this.find(table, sid, cache, cb);
        return;
    }
    try {
        this.rawquery(table, {_id: cache.toObjectId(sid)}, function querycb(results) {
            if ((results == null) || (results.length != 1)) {
                throw new Error('did refind of '+id+' from '+table+' and got back null');
            }
			var result = results[0];
			obj.convertFromDB(result, cb);
		});
    } catch (err) {
		Util.error("Did refind by id ("+id+") in "+table+" and got an error:"+err);
		throw err;
    }
};

/**
 * query
 *
 * query the db for records (or only 1 record).  We know it is not in
 * local cache except as a place holder.  run converfromdb on all
 * returned results.  call cb with null if not found.  If more than 1
 * is returned and expectedCount == 1 throw an error.
 *
 * @param {!string} table
 * @param {!Object} query
 * @param {!GenCache} cache
 * @param {!(function(DatabaseBackedObject)|function(!Array.<!DatabaseBackedObject>))} cb
 * @param {number=} expectedCount		0 -> don't know how many, each object in return set will call callback
 *						1 -> we expect exactly one result, will get it as the param of the callback
 *						2 -> we don't know how many, but one callback with all results in an array
 **/
MongoDB.prototype.query = function(table, query, cache, cb, expectedCount) 
{
    //SLOWvar xxx = new Error("prepare for multuple on "+table+" of query "+JSON.stringify(query));
    expectedCount = expectedCount || 0;
    this.rawquery(table, query, function querycb(results) {
			var resultarray = null;
			var finalCB = cb;
			if ((expectedCount == 1) && (results.length > 1)) {
				Util.error("!expected one record back from "+table+" got "+results.length+" using "+JSON.stringify(query));
				//SLOWvar x = new ExpectedOneRecord('from '+table+":"+JSON.stringify(query)+" but got "+results.length+"["+xxx.stack+"]");
                var x = new ExpectedOneRecord('from '+table+":"+JSON.stringify(query)+" but got "+results.length);
			} else if (expectedCount > 1) {
				// we are expecting an array of items
				resultarray = [];
				var todoCount = results.length;
				cb = function  (obj) { 
					if (--todoCount == 0) finalCB(resultarray); 
					else resultarray.push(obj);
				};
			}
			if (results.length == 0) {
				finalCB(resultarray);
			}
			var i;
			var len = results.length;
			for (i=0; i<len; i++) {
				var result = results[i];
				// check to see if this object is already in our local cache
				var sid = result._id+"";
				var obj;
                if (sid in cache.oldall) {
                    cache.all[sid] = cache.oldall[sid];
                    delete cache.oldall[sid];
                }
				if (sid in cache.all) {
					// in cache.all - have we already fetched it or is it the temp object we created?
					obj = cache.all[sid];
					if ("_id" in obj) {
						// already have it, so update, don't create a duplicate
						Util.error("This may not be an error, but we got a duplicate object from "+table+" with id "+sid);
						throw new Error("Duplicate id when calling "+table);
                        //#removeIfShip
						obj = cache.all[sid];
						obj.clearForDB();
                        //#endremoveIfShip
					} 
				} else {
					obj = new cache.cls();
					cache.all[sid] = obj;
				}
				obj.id = sid;
				obj.convertFromDB(result, 
								  function xx4(dobj) {  
									  // the object has been converted.  See about waiters
                                      dobj._id = result._id;
									  if ("waiting" in dobj) {
										  var waiters = dobj.waiting;
										  delete dobj['waiting'];
										  var i;
										  var len = waiters.length;
										  for (i=0; i<len; i++) {
											  waiters[i](dobj);
										  }
									  }
									  cb(dobj);
								  });
			}
		});
};


/**
 * insert
 * insert a new record into the DB
 *
 * @param {!string} table
 * @param {!DatabaseBackedObject} obj
 * @param {function(!DatabaseBackedObject)=} cb
 **/
MongoDB.prototype.insert = function(table, obj, cb)
{
    var me = this;
    var collection = this.getCollection(table);
    obj.convertToDB(function withconvert(record) {
            collection.save(record, {safe:me.safety},
                            function xx6(err, objects) {
                                if (err) {
                                    Util.error("mongo insert error: "+err.message);
                                } 
                            });
            Util.assert(!(record._id == undefined), "after insert no _id");
            obj._id = record._id;
            obj.id = record._id+"";
            var cache = obj.constructor.directory;
            Util.assert(!(obj.id in cache.all), obj.id + " insert but already in .all of "+cache.description);
            cache.all[obj.id] = obj;
            obj.afterInsert();
            if (cb != undefined) cb(obj);
        });
};

// export DatabaseBackedObject, all changes to MongoDB happen as its
// prototype field is changed.  However, allow user to only include
// dbo.

module.exports.DatabaseBackedObject = DatabaseBackedObject;
module.exports.DBServer = mdb.DBServer;
module.exports.MongoDB = MongoDB;

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
