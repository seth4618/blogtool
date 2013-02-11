// a tcp server to handle requests from the blog author

Util = require("./util.js");
fs = require("fs");
var crypto = require('crypto');

var Config = require("./config.js");
Config.init('../data/config.txt');
Config.require(['authortcpport', 'users', 'entrypath']);

var TCPPORT = Config.getNumber('authortcpport');
var articleBase = Config.getString('entrypath');
var users = Config.get('users');

var maxBufferLines = 1000;
var verbose = false;

/** @type {function (new:TCPServer, !string, number):?} */
TCPServer = require('simpletcp').server();

/** @type {function (new:LineConnection, !TCPServer, !SocketConnection):?} */
LineConnection = require('simpletcp').LineConnection();

function startUp()
{
    var tcpserver = new TCPServer('author', TCPPORT, AuthorLink);
    tcpserver.setVerbose(verbose);
    tcpserver.on('listen', function() {  Util.info("author Server tcp started on port:"+TCPPORT); });
    tcpserver.on('connection', function(conn) { conn.start(); });
    tcpserver.on('error', function(err) { console.log('Trying to start server Got error: '+err); server.destroy(); });
    tcpserver.start();
}

/**
 * AuthorLink
 * A class returns personalized articles
 *
 * @constructor
 * @extends {LineConnection}
 *
 * @param {!TCPServer} server
 * @param {!SocketConnection} socket
 *
 **/
function AuthorLink(server, socket)
{
    AuthorLink.super_.call(this, server, socket);
    var me = this;
    this.makeNonce();
    this.usable = 0;
    this.on('data', function(obj) { me.onLineReceived(obj); });
}
Util.inherits(AuthorLink, LineConnection);

/** @type {!string} */ AuthorLink.prototype.username;

AuthorLink.commands = {};

AuthorLink.prototype.makeNonce = function()
{
    var len=16;
    var i;
    var letters = [];
    for (i=0; i<len; i++) {
	letters.push(String.fromCharCode(Math.floor(65+Math.random()*26)));
    }
    this.nonce = letters.join('');
};

/**
 * start
 * indicate we are ready to use this connection, so tell client that is so
 *
 **/
AuthorLink.prototype.start = function()
{
    this.write("Hello "+this.nonce);
};

/**
 * lineReceived
 * got a line from the client
 *
 * @param {!String} str
 **/
AuthorLink.prototype.lineReceived = function(str)
{
    if (verbose) console.log('[%s]', str);

    if (/^x/.test(str)) {
	// continuation
	this.xbuffer.push(str.substr(1));
    } else {
	str = str.replace(/^[ \t]+/, "");
	str = str.replace(/[ \t\r\n]+$/, "");
	if (str == "") {
	    // done with previous command, if any
	    this.execute();
	} else {
	    // starting a new command
	    var words = str.split(/[ \t]+/);
	    if (!(words[0] in AuthorLink.commands)) {
		this.write('Unknown command '+words[0]);
		this.xbuffer = [];
		this.cmd = "nop";
		return;
	    }
	    this.xbuffer = [str];
	    this.cmd = words[0];
	}
    }
    // some basic throttles on memory usage
    if ((this.usable == 0)&&(this.xbuffer.length > 10)) {
	// this is a user without a valid password yet and they already have 10 lines queued up, kill them
	this.destroy();
    } else if (this.xbuffer.length > maxBufferLines) {
	// tell user they exceeded line length, reset, and make them unusable.
	this.write('exceed maximum buffer size: need to login in again');
	this.xbuffer = [];
	this.xbuffer.usable = 0;
    }
};

AuthorLink.prototype.execute = function()
{
    console.log('About to execute [%s]', this.cmd);
    if ((this.usable != 0)||(this.cmd == 'login'))
	AuthorLink.commands[this.cmd].call(this);
    else 
	this.write('Server is unusable til you login');
    this.xbuffer = [];
    this.cmd = 'nop';
};

/**
 * login
 * login a client, must be first call from client
 *
 * @private
 **/
AuthorLink.prototype.login = function()
{
    var words = this.xbuffer[0].split(/[ \t]+/);
    if (words.length != 3) {
	this.write('bad login ['+this.xbuffer[0]+']');
	return;
    }
    this.username = words[1];
    if (!(this.username in users)) {
	this.write('bad user ['+this.xbuffer[0]+']');
	return;
    }
    var hash = crypto.createHash('md5').update(this.nonce+users[this.username]).digest("hex");
    var passwd = words[2];
    console.log('%s -> %s =?= %s', this.nonce+users[this.username], hash, passwd);
    if (hash != passwd) {
	this.write('very bad login ['+this.xbuffer[0]+']');
	return;
    }
    this.usable = 1;
    this.write(this.username+" is logged in.");
};

AuthorLink.prototype.nop = function()
{
    this.write('ok');
};

AuthorLink.prototype.publish = function()
{
    var article = this.xbuffer.splice(1).join('\n');
    var words = this.xbuffer[0].split(/[ \t]+/);
    if (words.length != 2) {
	    this.write('need filename');
	    return;
    }
    var fname = words[1];
    console.log('publishing\n%s\n', article);
    var me = this;
    try {
	    fs.stat(articleBase+fname, function(err, stats) {
	        if (!err) {
		        me.write('filename '+fname+' already exists');
	        }
	        fs.writeFile(articleBase+fname, article, 'utf8', function(err) {
		        if (err) throw err;
		        me.write('published '+fname);
	        });
	    });
    } catch (err) {
	    me.write('publish of '+fname+' failed: '+err);
    }
};

AuthorLink.commands['login'] = AuthorLink.prototype.login;
AuthorLink.commands['nop'] = AuthorLink.prototype.doNothing;
AuthorLink.commands['publish'] = AuthorLink.prototype.publish;

startUp();

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
