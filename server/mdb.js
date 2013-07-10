mongodb = require('mongodb');

/**
 * DBServer
 * a server for a database
 *
 * @constructor
 *
 * @param {string=} host
 * @param {number=} port
 * @param {string=} username
 * @param {string=} password
 **/
function DBServer(host, port, username, password) {
    this.host = host || "127.0.0.1";
    this.port = port || 27017;
    this.username = username;
    this.password = password;
    this.openMongo();
}

/** @type {!string} */ DBServer.prototype.host;
/** @type {number} */ DBServer.prototype.port;
/** @type {string|undefined} */ DBServer.prototype.username;
/** @type {string|undefined} */ DBServer.prototype.password;
/** @type {!Object} */ DBServer.prototype.server;
/** @type {function(new:DB)} */ DBServer.prototype.DB;

DBServer.prototype.openMongo = function() {
    var replSet;
    try {
        if (this.port == 27017) {
            replSet = new mongodb.Server(this.host, 27017, { auto_reconnect: true } );
        } else if (this.port == 27018) {
            replSet = new mongodb.Server( this.host, 27018, { auto_reconnect: true, slave_ok : true} );
        } else {
            throw new Error('port not 27017 or 27108');
        }
    } catch (err) {
        console.error('failed to open %s:%s because %s', this.host, this.port, err);
        throw err;
    }
    this.server = replSet;
};

////////////////////////////////////////////////////////////////

/**
 * DB 
 * a connection to a particular database on a server.  mysql lets
 * you specify user/pass on a per db basis, so if specified, they
 * override what was given to the server.
 *
 * @constructor
 *
 * @param {!DBServer} server
 * @param {!string} name
 * @param {string=} username
 * @param {string=} password
 **/
function DB(server, name, username, password) {
    this.server = server;
    this.name = name;
    this.username = username || server.username;
    this.password = password || server.password;
}

/**
 * MongoDB 
 * a connection to a particular database on a mongo server.
 *
 * @constructor
 * @extends DB
 *
 * @param {!DBServer} server
 * @param {!string} name
 * @param {string=} username
 * @param {string=} password
 **/
function MongoDB(server, name, username, password) {
    DB.apply(this, arguments);
    this.safety = {w:1,j:false};
    this.collections = {};
    this.errlist = {};
    this.errcntr = 0;
    MongoDB.instances.push(this);
}
Util.inherits(MongoDB, DB);

/** 
 * Used by the watchdog to track errors.
 *
 * @type {Array.<!MongoDB>} 
 */ 
MongoDB.instances = [];

/** 
 * @type {!mongodb.Connection} 
 */ 
MongoDB.prototype.connection;

/** 
 * set the default write concern for operations.  defaults to safe (for development) 
 * @type {boolean} 
 */ 
MongoDB.prototype.safety;

/** 
 * all the collections we have open
 * @type {Object.<!string,!mongodb.Collection>} 
 */ 
MongoDB.prototype.collections;

/**
 * open
 * open up the connection 
 *
 * @param {function()} cb	called when connection is op
 **/
MongoDB.prototype.open = function(cb) {
    var me = this;
    new mongodb.Db(this.name, 
                   (/** @type {!mongodb.Server} */ (this.server.server)), 
				   {w:1, j:false})
        .open(function (err, client) {
            if (err != null) {
                console.error('got back error on open: %s', err);
                throw err;
            }
            me.connection = client;
            cb();
        });
};

/**
 * setSafety
 * set default safety for operations
 *
 * @param {boolean} val
 **/
MongoDB.prototype.setSafety = function(val) {
    this.safety = val;
};

/**
 * openCollection
 * create a new collection that we can manipulate
 *
 * @param {!string} name
 * @return {!mongodb.Collection} 
 **/
MongoDB.prototype.openCollection = function(name) 
{
    if (name in this.collections) {
		return this.collections[name];
    }

    if (this.connection == undefined) throw new Error("no connection to db, getting "+name);

    var table = new mongodb.Collection(this.connection, name);
    this.collections[name] = table;
    return table;
};

/**
 * toObjectId
 * convert a string to an objectid
 *
 * @param {!string} s
 * @return {!DBID}
 **/
MongoDB.prototype.toObjectId = function(s) {
    if (typeof s == 'string')
		return new this.connection.bson_serializer.ObjectID(s);
	Util.assert(!(s == undefined), "s is undefined??");
    return (/** @type {!DBID} */ s);
};

// What follows are a series of declarations and functions to enable
// debugging for db errors.  If the SLOW blocks are enabled, the
// calling site that causes the error can be shown.  This is very
// slow, so in production comment out the SLOW code.  One still can
// get useful info about slow queries and such

/** @type {number} */ MongoDB.prototype.errcntr;
//SLOW/** @type {Object.<{left:number, obj:!Object, cb:(function()|undefined), loc:!Error}>} */ MongoDB.prototype.errlist;
/** @type {Object.<{left:number, obj:!Object, cb:(function()|undefined)}>} */ MongoDB.prototype.errlist;

/**
 * stashError
 * stash an error entry to track this find
 *
 * @param {function()|undefined} errcb
 * @param {!Object} obj
 **/
MongoDB.prototype.stashError = function(errcb, obj)
{
    var index = this.errcntr++;
    //SLOW    var info = {left:2, obj: obj, cb: errcb, loc: new Error('stashing error')};
    var info = {left:2, obj: obj, cb: errcb};
    this.errlist[index] = info;
    obj.errorHandler = index;
};

MongoDB.prototype.showStashedError = function(prompt, idx)
{
    if (!(idx in this.errlist)) {
        Util.error("Can't show stashed error for "+prompt+" idx = "+idx);
        return;
    }
    //SLOW    Util.error('stashed error for '+prompt+' is: '+this.errlist[idx].loc.stack);
    Util.error('stashed error for '+prompt);
};

/**
 * eraseError
 * success, so erase error entry
 *
 * @param {!Object} obj
 **/
MongoDB.prototype.eraseError = function(obj)
{
    delete this.errlist[obj.errorHandler];
    delete obj.errorHandler;
};

MongoDB.watchdog = function() 
{
    var i;
    var len = MongoDB.instances.length;
    for (i=0; i<len; i++) {
        MongoDB.instances[i].checkErrlist();
    }
};

MongoDB.intervalID = setInterval(MongoDB.watchdog, 10000);

MongoDB.prototype.checkErrlist = function()
{
    var cnt = 0;
    for (var idx in this.errlist) {
        cnt++;
        var info = this.errlist[idx];
        if (info.left-- < 0) {
            var obj = info.obj;
            Util.error('We had a find error for '+idx+' when finding '+obj.id+' of '+obj.constructor.table);
            //SLOW                 Util.error('Location of initial call is: '+info.loc.stack);
            var cb = info.cb;
            if (cb == undefined) {
                // no errcalback defined
                Util.error('We had a find error for '+idx+' when finding '+obj.id+' of '+obj.constructor.table);
                console.log(obj);
            } else {
                cb();
            }
            delete this.errlist[idx];
        }
    }
    if (cnt > 0) Util.info('checked '+cnt+' find entries ('+this.errcntr+')');
};

/**
 * getCollection
 * get the handle on the collection
 *
 * @private
 * @param {!string} name
 * @return {!mongodb.Collection}
 **/
MongoDB.prototype.getCollection = function(name)
{
    var collection = this.collections[name];
    if (collection == undefined)
	collection = this.openCollection(name);
    return collection;
};

/**
 * rawquerycb 
 * common callback processing for the raw query functions
 *
 * @param {Object} err
 * @param {Object} cursor
 * @param {!function(!Array)} cb
 */
MongoDB.prototype.rawquerycb = function(err, cursor, cb){
    if (err) throw err;
    cursor.toArray(function raw2arr(err, results) {
        if (err != null) Util.error("Error is: "+err);
        if (err) throw err;
        cb(results);
    });
};

/**
 * rawquery
 *
 * get an array back of db records, no processing done in here
 *
 * @param {!string} table
 * @param {!Object} query
 * @param {!function(!Array)} cb
 **/
MongoDB.prototype.rawquery = function(table, query, cb) 
{
    var me = this;
    var collection = this.getCollection(table);
    collection.find(query, undefined, {}, function (err, cursor){
        me.rawquerycb(err, cursor, cb);
    });
};

/**
 * rawquery2cursor
 *
 * get a cursor to a query
 *
 * @param {!string} table
 * @param {!Object} query
 * @param {!function(!mongodb.Cursor)} cb
 **/
MongoDB.prototype.rawquery2cursor = function(table, query, cb) 
{
    var me = this;
    var collection = this.getCollection(table);
    collection.find(query, undefined, {}, function(err, cursor) {
		if (err == null) cb(cursor);
		else throw err;
    });
};

/**
 * advancedQuery
 *
 * in case we need to be using the fields or options as described here:
 * -- https://github.com/christkv/node-mongodb-native/blob/master/docs/queries.md
 *
 * @param {!string} table
 * @param {!Object} query
 * @param {!Object|undefined} fields 
 * @param {!Object} options
 * @param {(!function(!Array)|!function(Object,Object))} cb
 * @param {boolean=} noConvert
 */
MongoDB.prototype.advancedQuery = function(table, query, fields, options, cb, noConvert) {
    var me = this;
    var collection = this.getCollection(table);
    collection.find(query, fields, options, function closure_mdb_544(err, cursor){
            if (noConvert) {
                /** @type {!function(Object,Object)} */ var ccb = (/** @type {!function(Object,Object)} */cb);
                ccb(err, cursor); 
            } else {
                me.rawquerycb(err, cursor, (/** @type {!function(!Array)} */ cb));
            }
    });
};


/**
 * getRecordCount
 *
 * get number of records that match a query.  If no query is
 * specified, it gives you the number of records in the collection.
 *
 * @param {!string} table
 * @param {!Object|!function(number)} query
 * @param {!function(number)=} cb
 **/
MongoDB.prototype.getCount = function(table, query, cb)
{
    var collection = this.getCollection(table);
	if ('function' === typeof query) {
		cb = query;
		query = {};
	}

	collection.count(query, function (err, num) {
			if (err != null) throw err;
			cb(num);
		});
};

/**
 * update
 * update an existing record.  The existing record is specified by id.  Only one record is updated.
 *
 * @param {!string} table
 * @param {!Object} doc
 * @param {!Object} update
 * @param {boolean=} upsert
 * @param {function(Error)=} cb
 **/
MongoDB.prototype.update = function(table, doc, update, upsert, cb)
{
    var me = this;
    var collection = this.getCollection(table);
    Util.assert('_id' in doc, "Can't update an object that is not in the db already for collection "+table);
    upsert = upsert || false;
    cb = cb || function xx7(err) {
        if (err) {
            Util.error("update error 1 on: "+table+": "+err.message);
            Util.error(JSON.stringify(doc));
            Util.error(JSON.stringify(update));
            throw err;
        }
    };
    collection.update({_id: doc._id}, update, {safe:this.safety, upsert : upsert}, cb);
};

/**
 * rawinsert
 * insert a new record
 *
 * @param {!string} table
 * @param {!Object} record
 * @param {boolean=} safety
 * @param {function(Object)=} cb
 **/
MongoDB.prototype.rawinsert = function(table, record, safety, cb)
{
    var me = this;
    //SLOWvar xxx = new Error();
    var collection = this.getCollection(table);
	if (safety == undefined) safety = this.safety;
    collection.insert(record, 
                      {safe:safety},
					  function xx71(err, doc) {
						  if (err) {
							  Util.error("update error 2 on "+table+": "+err.message);
                              Util.error(JSON.stringify(record));
                              //SLOWUtil.error("From: "+xxx.stack);
							  throw err;
						  }
                          if (cb == undefined) return;
                          cb(doc);
					  });
};

/**
 * rawupdate
 * update an existing record.  
 * The existing record is specified by id.  Only one record is updated.
 *
 * @param {!string} table
 * @param {!Object} query
 * @param {!Object} update
 * @param {boolean=} upsert
 * @param {boolean=} multi
 * @param {!function(Error=)=} cb
 **/
MongoDB.prototype.rawupdate = function(table, query, update, upsert, multi, cb)
{
    var me = this;
    var collection = this.getCollection(table);
    upsert = upsert || false;
    multi = multi || false;
    collection.update(query, 
                      update, 
                      {safe:this.safety, upsert:upsert, multi : multi},
					  function xx71(err) {
						  if (err) {
                              if (cb) cb(err);
							  Util.error("update error 3 on "+table+": "+err.message);
                              Util.error(JSON.stringify(query));
                              Util.error(JSON.stringify(update));
							  throw err;
						  }
                          if (cb) cb();
					  });
};

module.exports.DBServer = DBServer;
module.exports.MongoDB = MongoDB;


// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
