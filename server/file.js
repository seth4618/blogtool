var Path = require("path");
var fs = require("fs");

/**
 * FileFragment
 * read in a file and break into pieces
 *
 * @constructor
 * @param {!string} str
 **/
function FileFragment(str)
{
	var re = FileFragment.matcher;
	this.pieces = [];
	this.map = {};
	var last = 0;
	var location = 0;
	var result;
	// first replace all special tokens with their values
	for (var token in FileFragment.special) {
		var sre = new RegExp(token, 'g');
		//console.log('map %s -> %s', sre, FileFragment.special[token]);
		str = str.replace(sre, FileFragment.special[token]);
	}
	// search for all replacement tokens
	while (result = re.exec(str)) {
		//console.log('%s re: %d %d %j %d', re, re.lastIndex, re.global, result, result.index);
		var matchStart = result.index; // start of replacement token
		var match = result[0];		   // replacement token
		if (last != matchStart) {
			this.pieces.push(str.substring(last, matchStart));
			location++;
		}
		last = matchStart+match.length;
		var key = match.substr(1, match.length-2);
		if (key in this.map) {
			this.map[key].push(location);
		} else {
			this.map[key] = [ location ];
		}
		this.pieces.push(key);
		location++;
	}
	this.pieces.push(str.substr(last));
	//console.log(str);
	//console.log("\n================\n");
	//console.log(this.pieces.join("\n---------------\n"));
	//console.log("\n================\n%j\n", this.map);
}

FileFragment.matcher = /{.*?}/g;
FileFragment.special = {};
FileFragment.prototype.start = function()
{
	return new ReplacedFile(this);
}

/**
 * ReplacedFile
 * an instance of FileFrament with slots to be filled in
 *
 * @constructor
 * @param {!FileFragment} ff
 **/
function ReplacedFile(ff)
{
	this.base = ff;
	this.vals = [];
}

ReplacedFile.prototype.replace = function(key, val)
{
	this.vals.push([key, val]);
}

ReplacedFile.prototype.asString = function()
{
	var len = this.vals.length;
	for (var i=0; i<len; i++) {
		var replist = this.base.map[this.vals[i][0]];
		var rlen = replist.length;
		for (var j=0; j<rlen; j++) {
			//console.log('%s @ %d -> %s', this.vals[i][0], replist[j], this.vals[i][1]);
			this.base.pieces[replist[j]] = this.vals[i][1];
		}
	}
	return this.base.pieces.join('');
}


/**
 * FileServer
 * a simple file cache with refresh
 *
 * @constructor
 *
 **/
function FileServer(path, cache) {
    this.path = path;
    this.cache = cache;
    this.count = 0;
    this.ok = false;
    this.mtime = 0;
	this.zeros = 0;


    if (this.cache) {
		this.cacheit();
    }
}

/** @type {Object.<!string,!FileServer>} */ FileServer.cached = {};
/** @type {Object.<!string,number>} */ FileServer.stats = {};
/** @type {Object.<!string,{pieces:!FileFragment,type:!string}>} */ FileServer.pieces = {};
/** @type {number} */ FileServer.intervalId;
/** @type {number} 
 *  @const */ FileServer.intervalTime = (60000*5);
/** @type {number} */ FileServer.CacheAfterReads = 5;

/** @type {!string} */ FileServer.prototype.path;	// relative to server root path
/** @type {!string} */ FileServer.prototype.content;	// content of this file if cached
/** @type {boolean} */ FileServer.prototype.cache;	// keep in our cache
/** @type {boolean} */ FileServer.prototype.ok;	// if false, we can't find the file
/** @type {number} */ FileServer.prototype.count;	// how many times we served this file
/** @type {number} */ FileServer.prototype.zeros;	// how many epochs noone asked for it
/** @type {!string} */ FileServer.prototype.type;	// content type of this file
/** @type {number} */ FileServer.prototype.mtime;	// timestamp of filesystem last modification time

/**
 * read
 * read a file from the file system
 *
 * @private
 * @param {!string} pathname	relative to root of server
 * @param {function(boolean, !string, !string)} cb
 **/
FileServer.read = function(pathname, cb)
{
    var path = BASEPATH + pathname;
    Path.exists(path, function checkexists(exists) {  
	    if(!exists) {  
		cb(false, '', '');
		return;
	    }
	    fs.readFile(path, "binary", function zz2(err, file) {  
		    if(err) {  
				Util.error(pathname+" exists, but error on reading:"+err);
				cb(false, '', '');
				return;
		    }  
   
		    // compute content type
		    var dot = path.lastIndexOf(".");
		    var ext;
		    if (dot > 0) {
			ext = path.substr(dot+1);
		    }
		    var ct = "text/html";
		    if (ext == "js") {
			ct = "application/javascript";
		    } else if (ext == "css") {
			ct = "text/css";
		    } else if (ext == "ico") {
			ct = "image/x-icon";
		    } else if (ext == "jpg") {
			ct = "image/jpg";
		    } else if (ext == "png") {
			ct = "image/png";
		    } else if (ext == "gif") {
			ct = "image/gif";
		    } 
		    cb(true, file, ct);
		});
	});
};

/**
 * get
 * get a file from either cache or disk and break into pieces
 *
 * @param {!string} pathname	relative to root of server
 * @param {function(boolean, !FileFragment, !string)} cb
 **/
FileServer.getPieces = function(pathname, cb)
{
	//console.log('getting %s', pathname);
	if (pathname in FileServer.pieces) {
		var file = FileServer.pieces[pathname];
		cb(true, file.pieces, file.type);
		return;
	} 
	FileServer.get(pathname, function genp(exists, c, ct) {
		if (!exists) {
			// let called handle error
			cb(exists, c, ct);
			return;
		}
		console.log('PIECES OF %s', pathname);
		var ff = new FileFragment(c);
		FileServer.pieces[pathname] = { pieces: ff, type: ct };
		cb(exists, ff, ct);
	});
}

/**
 * get
 * get a file from either cache or disk
 *
 * @param {!string} pathname	relative to root of server
 * @param {function(boolean, !string, !string)} cb
 **/
FileServer.get = function(pathname, cb)
{
    if (pathname in FileServer.cached) {
		var file = FileServer.cached[pathname];
		if (file.ok) {
			// file is cached and valid
			cb(true, file.content, file.type);
			file.count++;
			return;
		}
		// cached, but not ok, so try and read it
    }
    // not being cached, read and return
    FileServer.read(pathname, cb);
    if (!(pathname in FileServer.stats)) FileServer.stats[pathname] = 0;
    FileServer.stats[pathname]++;
	if (FileServer.stats[pathname] > FileServer.CacheAfterReads) {
		Util.info("Will try and cache: "+pathname);
		new FileServer(pathname, true);
	}
};

/**
 * serve
 * serve a file
 *
 * @param {!string} pathname	relative to root of server
 * @param {!Responder} response
 **/
FileServer.serve = function(pathname, response)
{
	FileServer.get(pathname, 
				   function closure_file_127(exists, content, ct) {
					   if(!exists) {  
						   response.err(404, pathname+" does not exist");
						   return;  
					   }
					   response.binary(content, ct);
				   });
};

/**
 * watchdog
 * check to make sure cache is up to date
 *
 * @private
 **/
FileServer.watchdog = function()
{
    var path;
    for (path in FileServer.cached) {
		var f = FileServer.cached[path];
		//SKIP Util.info("C "+f.count+"\t"+f.zeros+"\t"+path);
		f.cacheit();
		if (f.count == 0) f.zeros++;
		f.count = 0;
    }
	for (path in FileServer.stats) {
		//SKIP Util.info("  "+FileServer.stats[path]+"\t\t"+path);
		FileServer.stats[path] = 0;
	}
};

/**
 * initFileCache
 * called at startup to init file cache, timers, etc.
 *
 * @param {!Array.<!string>} files
 * @param {function()=} cb			called back when all files are setup and loaded
 **/
FileServer.initFileCache = function(files, cb)
{
    FileServer.intervalId = setInterval(FileServer.watchdog, FileServer.intervalTime);
    var i;
    var len = files.length;
    for (i=0; i<len; i++) {
		new FileServer(files[i], true);
    }
	if (cb == undefined) return;
	// if we get here there is a callback that wants to be called after all inited files have been cached
	var checkTimes = 0;			// how many times we check for the files to be done

	// function to check cache status
	var checkfiles = function() {
		var i;
		var resched = 0;
		// for each file in init list, see if loaded
		for (i=0; i<len; i++) {
			var path = files[i];
			if (!(path in FileServer.cached)) {
				if (checkTimes > len) Util.info("Still waiting for "+path);
				resched++;
			} else if (FileServer.cached[path].ok == false) {
				if (checkTimes > len) Util.info("Still waiting for "+path+" to be ok");
				resched++;
			}
		}
		checkTimes++;
		Util.info("Checked for file cache loaded "+checkTimes+ " time(s). "+resched+" remaining");
		if (resched > 0) {
			// if we had some not done, reshedule check (or abort server)
			if (checkTimes > len*10) {
				Util.error("Aborting server start after "+checkTimes);
				Util.exit(-1);
			} else {
				setTimeout(checkfiles, 200+(50*resched));
			}
		} else {
			// everything loaded, so issue callback
			cb();
		}
	}
	setTimeout(checkfiles, 200);
};

/**
 * cacheit
 * read and cache a file if itt has changed since we last read it
 *
 * @private
 **/
FileServer.prototype.cacheit = function()
{
    var me = this;

    // get mtime, then decide if we really need to read

    fs.stat(BASEPATH + this.path, 
			function statret(err, stats) {
				if (err) {
					Util.error('failed to stat '+me.path);
					me.ok = false;
					throw err;
				}
				// we stat-ed file, see about a change in its time
				if (stats.mtime.getTime() != me.mtime) {
					// we need to update
					Util.info("Updating the cached file "+me.path);
					me.mtime = stats.mtime.getTime();
					if (!(me.path in FileServer.cached)) FileServer.cached[me.path] = me;
					// we need to zap pieces if it exists
					if (me.path in FileServer.pieces) {
						// will get recreated on demand
						delete FileServer.pieces[me.path];
					}

					FileServer.read(me.path, 
									function readret(exists, contents, ct) {
										if (!exists) {
											me.ok = false;
											Util.error("cached file '"+me.path+"' does not exist");
											return;
										}
										me.ok = true;
										me.type = ct;
										me.content = contents;
									});
				}
			});	
};

/**
 * cssServe
 * get css customized for this page
 *
 * @param {!Responder} response
 * @param {!Array.<!string>} args
 * @param {ActiveWidget} aw
 * @param {http.ServerRequest} request
 **/
FileServer.cssServe = function(response, args, aw, request)
{
	var fname = args[0];
	var path = basedir+"/css/"+fname;
	//Util.debug(1, "serving css for "+aw.id+" using "+aw.theme);
	Theme.find(aw.theme, function closure_file_265(theme) {
			response.binary(theme.serve(path), "text/css");
		});
};

module.exports = FileServer;


// Local Variables:
// tab-width: 4
// End:
