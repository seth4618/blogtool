// assume FileServer has been required
// assume Util has been required
// assume Synchronizer has been required
var fs = require("fs");

function Post(fname)
{
    this.name = fname;
    Post.all[fname] = this;
    var me = this;
    FileServer.get(Post.basepath+fname, function(ok, content, ct) { me.parse(ok, content); });
    Post.sorted = [];
}

/** @type {!string} */ Post.basepath = "/home/seth/blog/entries/";
/** @type {number} */ Post.intervalId;
/** @type {number} 
 *  @const */ Post.watchdogSeconds = 60;
Post.sorted = [];
Post.all = {};

Post.formatAll = function() {
    if (!Post.sorted || Post.sorted.length == 0) {
	Util.info('require posts to be sorted');
	// sort in descending order
	for (var name in Post.all) {
	    //console.log('%s: %j', name, Post.all[name]);
	    Post.sorted.push(Post.all[name]);
	}
	Post.sorted.sort(function(a,b) { return b.date.getTime() - a.date.getTime(); });
    }
    Util.info('Formating all posts: '+Post.sorted.length);
    var result = [];
    var len = Post.sorted.length;
    var i;
    for (i=0; i<len; i++) {
	result.push(Post.sorted[i].format());
    }
    return result.join('\n\n');
};

Post.watchdog = function() {
    fs.readdir(Post.basepath, function(err, files) {
	if (err) {
	    Util.error('Failed in post watchdog:'+err);
	    return;
	}
	var i;
	var len = files.length;
	for (i=0; i<len; i++) {
	    var name = files[i];
	    if (/^\./.test(name)) continue;
	    if (name in Post.all) continue;
	    new Post(name);
	}
    });
};

/**
 * startWatchdog
 * start watchdog timer on widgets
 *
 **/
Post.startWatchdog = function() {
    Post.intervalId = setInterval(Post.watchdog, Post.watchdogSeconds*1000);
};

/**
 * stopWatchdog
 * start watchdog timer on widgets
 *
 **/
Post.stopWatchdog = function() {
    if (Post.intervalId == 0) return;
    clearInterval(Post.intervalId);
    Post.intervalId = 0;
};

Post.prototype.parse = function(ok, content)  
{
    if (!ok) return;
    
    // process header information and grab body
    var header;
    var text;
    text = content.match(/^(Date.*\nTitle:.*\nCategories:.*)\n+([^]*)$/m);
    if (text == null) {
	Util.info('Failed to parse out header from '+content);
	//Util.exit(0);
	return;
    }
    header = text[1];
    //console.log('header = [%s] From: [%s]', header, content);
    this.body = text[2];
    text = header.match(/^Date: (.*?) *$/m);
    this.date = new Date(text[1]);
    text = content.match(/\nTitle: *(.*?) *\n/);
    this.title = text[1];
    text = content.match(/\nCategories: *(.*?) *\n/);
    this.categories = text[1].split(/ *, */);
    if (/^ *$/.test(this.title)) this.title = "Another Blog Post for "+this.categories.join(',');

    // do some processing on body
    
    var original = this.body.split('\n');
    var body = [];
    var len = original.length;
    var last = len-1;
    var i = 0;
    // first, any seq of indented lines becomse code
    while (i<len) {
	// skip repeated blank only lines
	while ( (/^[ \t]*$/.test(original[i])) &&
		(i < last) &&
		(/^[ \t]*$/.test(original[i+1]))) i = i+1;

	if (/^[ \t]*$/.test(original[i])) {
	    if ((i<last) && /^[ \t]/.test(original[i+1])) {
		// start of code block
		body.push('<p><pre>\n');
		i++;
		while ((i<len) && !/^[^ \t\n]/.test(original[i])) {
		    body.push(original[i]);
		    i++;
		}
		body.push('</pre>\n<p>\n');
		i--;
	    } else {
		body.push('\n<p>\n');
	    }
	} else {
	    body.push(original[i]);
	}
	i++;
    }
    this.body = body.join('\n');
};

Post.prototype.format = function()
{
    var cats = '';
    if (this.categories.length > 0) cats = '['+this.categories.join(",")+"]";
    var date = [1+this.date.getMonth(), '/', 
		this.date.getDate(), '/',
		this.date.getFullYear()-2000, ' ',
		this.date.getHours() % 12, ':',
		this.date.getMinutes() < 10 ? ('0'+this.date.getMinutes()) : this.date.getMinutes(), 
		(this.date.getHours() > 12) ? 'pm' : 'am'].join('');

    var info = ['<div class="post">\n',
		'<div class="post-title">',
		this.title,
		'</div>',
		'<div class="post-date">',
		date,
		'</div>',
		'<div class="post-cat">',
		cats,
		'</div>',
		'<div class="post-content">',
		this.body,
		'</div>',
	       '</div>'];
    return info.join('\n');
};



////////////////
////////////////

module.exports = Post;

// read in intial posts
Post.watchdog();

// Finally, get watchdog started
Post.startWatchdog();
