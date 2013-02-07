var port = 8080;
http = require("http");
Util = require("./util.js");
url = require("url");
FileServer = require("./file.js");
var server;
Config = require('./config.js');
Config.init('../data/config.txt');
Config.require(['gacode', 'basepath']);
BASEPATH = Config.getString('basepath');
Synchronizer = require("./sync.js");
Post = require('./post.js');

var analyticsCode;

// set up replacements
FileServer.setReplacementKey('posts', {func: function(rf) { return Post.formatAll(); }, sync: 1});
FileServer.setReplacementKey('post', {func: Post.formatPost, sync: 0});
FileServer.setReplacementKey('cats', {func: Post.formatCats, sync: 1});
FileServer.setReplacementKey('postsbycat', {func: Post.formatAllInCat, sync: 0});
FileServer.setReplacementKey('ga', {func: function(rf) { return analyticsCode; }, sync: 1});

// init the analytics code
analyticsCode = ['<script type="text/javascript">var _gaq = _gaq || [];  _gaq.push([\'_setAccount\', \'', Config.getString('gacode'), '\']);  _gaq.push([\'_trackPageview\']);  (function() {    var ga = document.createElement(\'script\'); ga.type = \'text/javascript\'; ga.async = true;    ga.src = (\'https:\' == document.location.protocol ? \'https://ssl\' : \'http://www\') + \'.google-analytics.com/ga.js\';    var s = document.getElementsByTagName(\'script\')[0]; s.parentNode.insertBefore(ga, s);  })();\n</script>'].join('');

// init the fileserver
FileServer.initFileCache([BASEPATH+'/index.php']);

try {
    /** @type {!http.Server} */ server = http.createServer(onRequest);
} catch (err) {
    Util.error("Will Die!!!  Failed to create server instance: "+err);
    Util.exit(-1);
}

/**
 * onRequest
 * handle a new request on http server
 *
 * @param {!http.ServerRequest} request
 * @param {!http.ServerResponse} response
 **/
function onRequest(request, response) {
    var reqdata = url.parse(request.url, true);
    var pathname = reqdata.pathname;
    var jsonp;
    if (!('callback' in reqdata.query)) {
        // no callback param
        jsonp = '';
    } else {
        jsonp = reqdata.query.callback;
    }
    var cookies;

    try{
        var responder = new Responder(response, jsonp, pathname, cookies);
        Router.route(pathname, responder, request);
    } catch(err) {
        Util.error(err+"\nStack:"+err.stack);
        responder.err(500, 'server internal error:'+err);
    }
};

/**
 * Responder
 * class to deal with generating a response
 *
 * @constructor
 * @param {!http.ServerResponse} response
 * @param {!string} jsonPname
 * @param {string=} origin
 * @param {Cookies=} cookies
 **/
function Responder(response, jsonPname, origin, cookies)
{
    this.response = response;
    this.jsonPname = jsonPname;
    this.origin = (origin == undefined) ? "unknown" : origin;
    this.start = new Date();
    this.id = Responder.qnum++;
    this.cookies = cookies;
    this.seen = 0;
    Responder.all[this.id] = this;
}

/** @type {number} */ Responder.qnum = 0;
/** @type {Object.<number, !Responder>} */ Responder.all = {};

/** @type {!http.ServerResponse} */ Responder.prototype.response;
/** @type {!string} */ Responder.prototype.jsonPname;
/** @type {string} */ Responder.prototype.origin;
/** @type {!Date} */ Responder.prototype.start;
/** @type {number} */ Responder.prototype.id;
/** @type {number} */ Responder.prototype.seen;
/** @type {(Cookies|undefined)} */ Responder.prototype.cookies;

/**
 * err
 * response with an error code
 *
 * @param {number} code
 * @param {string=} msg
 **/
Responder.prototype.err = function(code, msg)
{
    msg = msg || ("Error: "+code);
    Util.info((code == 404 ? "Not found being returned:" : "Writing error ")+code+":"+msg);
    if (this.response == undefined) {
        Util.error('About to return error:'+code+' but response already deleted');
        return;
    }
    this.response.writeHead(code, {"Content-Type": "text/html"});
    this.response.write(msg);
    this.response.end();
    this.done();
};

/**
 * simple
 * response with simple msg
 *
 * @param {string} msg
 * @param {string=} contentType
 * @param {boolean=} noCache
 **/
Responder.prototype.simple = function(msg, contentType, noCache)
{
    contentType = contentType || "text/html";
    var headers = { "Content-Type": contentType};
    if (noCache) {
        //set the expire to yesterday
        headers['Expires'] = "Sat, 26 Jul 1997 05:00:00 GMT";
        //say don't cache this at all
        headers['Cache-Control'] = "no-cache, must-revalidate";
    }
    this.response.writeHead(200, headers);
    this.response.write(msg);
    this.response.end();
    this.done();
};

/**
 * binary
 * response with simple msg use binary mode
 *
 * @param {string} msg
 * @param {string=} contentType
 **/
Responder.prototype.binary = function(msg, contentType)
{
    contentType = contentType || "text/html";
    this.response.writeHead(200, {"Content-Type": contentType});
    this.response.write(msg, "binary");
    this.response.end();
    this.done();
};

/**
 * binary
 * response with simple msg use binary mode
 *
 * @param {string} msg
 * @param {string=} contentType
 **/
Responder.prototype.utf8 = function(msg, contentType)
{
    contentType = contentType || "text/html";
    this.response.writeHead(200, {"Content-Type": contentType});
    this.response.write(msg);
    this.response.end();
    this.done();
};

/**
 * send a 404 not found
 *
 * @param {string} msg
 */
Responder.prototype.err404 = function(msg){
    this.response.writeHead(404, {"Content-Type": "text/html"});
    this.response.write(msg ? '' : msg);
    this.response.end();
    this.done();
};

/**
 * returnJS
 *
 * returns a bit of javascript 
 */
Responder.prototype.returnJS = function(s)
{
    this.simple(s, 'application/javascript', true);
};

/**
 * expireNoop
 *
 * returns a bit of javascript that does nothing and expires the resource by
 * setting the expires header to be in the past.
 */
Responder.prototype.expireNoop = function()
{
    var pstring = '//page not found, homie!\nif (0) {}';
    this.simple(pstring, 'application/javascript', true);
};

/**
 * done
 * we are done with this response
 *
 * @private
 **/
Responder.prototype.done = function()
{
    delete Responder.all[this.id];
    delete this.response;
    if (this.cookies) delete this.cookies;
};

/**
 * showWaiting
 * will show waiting connections and also mark as having been seen.  If seen twice, kill it
 *
 * @private
 **/
Responder.showWaiting = function()
{
    var id;
    var count = 0;
    var deleted = 0;

    for (id in Responder.all) {
	var r = Responder.all[(/** @type {number} */ id)];
        count++;
        if (r.seen > 2) {
            // we saw this more than once, so kill it
            Util.error('deleting responder for '+r.origin);
	    deleted++;
            r.done();
        } else {
            r.seen++;
        }
    }
    if ((count+deleted) > 0) Util.info("Connection waiting:"+count+" deleted:"+deleted);
};


Responder.intervalId = setInterval(Responder.showWaiting, 120000);

Responder.prototype.getCookies = function()
{
	return this.cookies;
};

/**
 * sendP3P
 *
 * send P3P headers so ie will actually keep the cookie
 **/
Responder.prototype.sendP3P = function()
{
    this.response.setHeader('P3P', 'CP="NOI DSP COR DEV PSA PSD IVA IVD OUR BUS UNI COM NAV INT CNT STA"');
};

/**
 * Router
 * routes requests to the proper handler
 *
 * @constructor
 **/
function Router() {}

/** @type {number} */ Router.len;
/** @type {Array.<!RegExp>} */ Router.routes = [];
/** @type {Array.<!function(!string,!Responder,!function(string))>} */ Router.funcs = [];

Router.init = function()
{
    var routedefs = require('./routing.js');
    var len = routedefs.length;
    var i;
    for (i=0; i<len; i++) {
	var def = routedefs[i];
	for (key in def) {
	    Router.routes[i] = new RegExp(key);
	    Router.funcs[i] = def[key];
	}
	console.log('Adding Route: %s', key);
    }
    Router.len = len;
}

/**
 * route
 * decide how to handle request
 *
 * @param {string} pathname
 * @param {!Responder} response
 * @param {!http.ServerRequest} request
 **/
Router.route = function(pathname, response, request) 
{
    Util.req(pathname);
    for (i=0; i<Router.len; i++) {
	if (Router.routes[i].test(pathname)) {
	    Router.funcs[i](pathname, response, function(newpath) {
		if (newpath != null) Router.route(newpath, response, request);
	    });
	    break;
	}
    }
};

// get routes loaded
Router.init();

// Don't start listening til we have defined routes
try {
    server.listen(port, function () { 
        Util.info("Listening called on listen to "+port);
    });
} catch (err) {
    if (err.code == "EADDRINUSE") {
        Util.error("Can't start server on port = "+port);
    } else {
        Util.error("tried to start port and failed: "+err);
    }
    Util.exit(-1);
}

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
