// assume FileServer has been required
// assume Util has been required
// assume Synchronizer has been required
var fs = require("fs");

pagedown = require("pagedown");
converter = new pagedown.Converter();

function Post(fname)
{
    this.id = Post.id++;
    Post.id2post[this.id] = this;
    this.name = fname;
    Post.all[fname] = this;
    Util.info("Creating post from "+fname);
    var me = this;
    FileServer.get(Post.basepath+fname, 
		   function(ok, content, ct) { 
		       me.parse(ok, content); });
    Post.sorted = [];
}

/** @typedef {number} */ Post.ID;

/**
 * @enum {number}
 * @const
 */
Post.Format = {
    Default: 0,
    Synopsis: 1,
    TitleLink: 2
};

/** @type {!string} */ Post.basepath = "/home/seth/blog/entries/";
/** @type {number} */ Post.intervalId;
/** 
 * @type {number} 
 * @const 
 */ 
Post.watchdogSeconds = 30;

/** @type {number} */ Post.id = 0;
Post.sorted = [];
Post.all = {};
/** @type {Object.<!Post.ID,!Post>} */ Post.id2post = {};
Post.url2post = {};
/** @type {Object.<!string,!Array.<!Post.ID>} */ Post.cat2post = {};

/** @type {!string} */ Post.prototype.name;
/** @type {!Post.ID} */ Post.prototype.id;
/** @type {!Array.<!string>} */ Post.prototype.categories;
/** @type {!string} */ Post.prototype.body;
/** @type {!Date} */ Post.prototype.date;
/** @type {!string} */ Post.prototype.title;
/** @type {!string} */ Post.prototype.url;
/** @type {!string} */ Post.prototype.synopsis;

/**
 * formatPost
 * format a post for the specific request
 *
 * @param {!ReplacedFile} rf
 * @param {!function(!string)} cb
 * @return {!boolean}
 **/
Post.formatPost = function(rf, cb) {
    var url = rf.response.origin.toLowerCase();
    if (!(url in Post.url2post)) {
	return false;
    }
    var str = Post.url2post[url].format(Post.Format.Default);
    cb(str);
    return true;
};

Post.formatCats = function()
{
    var ret = ['<ul>' ];
    var names = [];
    for (name in Post.cat2post) names.push(name);
    names.sort();
    var len = names.length;
    var i;
    for (i=0; i<len; i++) {
	ret.push(['<li>', names[i], '(', Post.cat2post[names[i]].length, ')</li>'].join(''));
    }
    ret.push('</ul>\n');
    return ret.join('\n');
};

/**
 * formatAll
 * format all posts on one page
 *
 * @return {!string}
 **/
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
	result.push(Post.sorted[i].format(Post.Format.Synopsis|Post.Format.TitleLink));
    }
    return result.join('\n\n');
};

/**
 * get
 * loopup post by id
 *
 * @param {!Post.ID} id
 * @param {!function(Post)} cb
 **/
Post.get = function(id, cb)
{
    if (id in Post.id2post) cb(Post.id2post[id]);
    else cb(null);
};

/**
 * setCachingInfo
 *
 * record mtime of file.  until DB is in action we will use mtime to
 * decide if we should reload post
 *
 * @private
 **/
Post.prototype.setCachingInfo = function()
{
    var me = this;
    fs.stat(Post.basepath+this.name, function (err, stats) {
	if (err) 
	    throw new Error("just loaded post "+me.name+" and couldn't stat: "+err);
	me.mtime = stats.mtime;
    });
};

Post.prototype.checkReload = function(removals, sync)
{
    var me = this;
    sync.wait(1);
    fs.stat(Post.basepath+this.name, function (err, stats) {
	if (err) {
	    // this post must have gone away
	    console.log('%s generated stat error %s', me.name, err);
	    removals.push(me);
	} else if (me.mtime.getTime() != stats.mtime.getTime()) {
	    // this post was modified
	    console.log('%s has update %s < %s', me.name, me.mtime, stats.mtime);
	    removals.push(me);
	}
	sync.done(1);
    });
};

Post.toRemove = [];
Post.watchdogPhase2 = function()
{
    // first remove all bad (or old) posts, 
    var i;
    var len = Post.toRemove.length;
    for (i=0; i<len; i++) {
	var p = Post.toRemove[i];
	p.remove();
    }
    Post.toRemove = [];

    // now check for new (or updated) posts
    fs.readdir(Post.basepath, function(err, files) {
	if (err) {
	    Util.error('Failed in post watchdog:'+err);
	    return;
	}
	var i;
	var len = files.length;
	for (i=0; i<len; i++) {
	    var name = files[i];
	    if (/^[.#]/.test(name)) continue;
	    if (name in Post.all) continue;
	    var p = new Post(name);
	    p.setCachingInfo();
	}
    });
};

Post.watchdog = function() {
    Post.toRemove = [];
    var sync = new Synchronizer(Post.watchdogPhase2, 1, "wr");

    for (var name in Post.all) {
	var p = Post.all[name];
	p.checkReload(Post.toRemove, sync);
    }
    sync.done(1);
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

/**
 * cleanupCategories
 * make sure there are no empty categories, make sure there is at least one, spellcheck, etc.
 *
 * @private
 **/
Post.prototype.cleanupCategories = function()
{
    var cats = [];
    var i;
    var len = this.categories.length;
    for (i=0; i<len; i++) {
	var cat = this.categories[i];
	if (cat == '') continue;
	cats.push(cat.charAt(0).toUpperCase() + cat.slice(1));
    }
    if (cats.length == 0) {
	cats = [ 'Everything' ];
    }
    this.categories = cats;
    // now track cat2post
    len = cats.length;
    for (i=0; i<len; i++) {
	var cat = cats[i];
	if (!(cat in Post.cat2post)) Post.cat2post[cat] = [];
	Post.cat2post[cat].push(this.id);
    }
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
    //console.log('\n%j', text);
    var url = this.title;
    text = content.match(/\nCategories: *(.*?) *\n/);
    this.categories = text[1].split(/ *, */);
    this.cleanupCategories();
    if (/^ *$/.test(this.title)) {
	this.title = "Another Post for "+this.categories.join(',');
	url = this.title;
    }
    // clean up title so it can be used as part of a file path
    var orig = url;
    url = url.replace(/[\]\[!@#$%^&*():;'"><?\/\\`~{}|., ]/g, "-").toLowerCase();
    // create full url from date and title
    url = [ '/post',
	    this.date.getFullYear(),
	    1+this.date.getMonth(),
	    this.date.getDate(),
	    url,
	  ].join('/');
    // make sure url is unique
    if (url in Post.url2post) {
	var pieces = [url, 1];
	url = pieces.join('-');
	while (url in Post.url2post) {
	    pieces[1] += 1;
	    url = pieces.join('-');
	}
    }
    this.url = url;
    Post.url2post[url] = this;
    Util.info("Loading "+this.title+" from "+this.name);
    //console.log('[%s] -> [%s] %s', orig, url, this.title);

    // do some processing on body
    
    var original = this.body.split('\n');
    var synopsis = [];
    var body = [];
    var len = original.length;
    var last = len-1;
    var i = 0;

    if (0) {
	// first, any seq of indented lines becomes code
	while (i<len) {
	    // skip repeated blank only lines
	    while ( (/^[ \t]*$/.test(original[i])) &&
		    (i < last) &&
		    (/^[ \t]*$/.test(original[i+1]))) i = i+1;

	    if (/^[ \t]*$/.test(original[i])) {
		if ((i<last) && /^[ \t]/.test(original[i+1])) {
		    // start of code block
		    synopsis.push('<tt>read post for code</tt>');
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
	    } else if (/^\'\'\'[ \t]*/.test(original[i])) {
		// new style code blocks surrounded by ''' at start of line
		synopsis.push('<tt>read post for code</tt>');
		body.push('<p><pre>\n');
		i++;		// skip opening '''
		while ((i<len) && !/^\'\'\'[ \t]*/.test(original[i])) {
		    body.push(original[i]);
		    i++;
		}
		body.push('</pre>\n<p>\n');
	    } else {
		body.push(original[i]);
		synopsis.push(original[i]);
	    }
	    i++;
	}
    } else {
	// lets try out using markdown with the pagedown module implementation
	while (i<len) {
	    // skip repeated blank only lines
	    while ( (/^[ \t]*$/.test(original[i])) &&
		    (i < last) &&
		    (/^[ \t]*$/.test(original[i+1]))) i = i+1;
	    if (/^\'\'\'[ \t]*/.test(original[i])) {
		synopsis.push('`read post for code`');
		body.push('\n');
		i++;		// skip opening '''
		while ((i<len) && !/^\'\'\'[ \t]*/.test(original[i])) {
		    body.push('    '+original[i]); // so markdown will turn it into code
		    i++;
		}
		body.push('\n');
	    } else {
		body.push(original[i]);	
	synopsis.push(original[i]);
	    }
	    i++;
	}
    }
    this.body = body.join('\n');
    if (synopsis.length > 7) synopsis.slice(7, synopsis.length-7);
    this.synopsis = synopsis.join('\n');
    if (1) {
	// finally, run through markdown processor
	this.body = converter.makeHtml(this.body);
	this.synopsis = converter.makeHtml(this.synopsis);
    }
};

/**
 * remove
 * remove from system and all dictionaries
 *
 **/
Post.prototype.remove = function()
{
    Util.info('Removing post from '+this.name);
    delete Post.all[this.name];
    Post.sorted = [];
    delete Post.url2post[this.url];
    delete Post.id2post[this.id];

    // remove from category all lists
    var len = this.categories.length;
    var i;
    for (i=0; i<len; i++) {
	var cat = this.categories[i];
	var list = Post.cat2post[cat];
	var ll = list.length;
	var j;
	for (j=0; j<ll; j++) {
	    if (list[j] == this.id) {
		list.splice(j,1); // remove it
		break;
	    }
	}
    }
    // delete all fields so if we missed a ref we will see it soon as an error
    delete this.categories;
    delete this.body;
    delete this.title;
    delete this.synopsis;
    delete this.date;
};

/**
 * format
 * format a post based on modifiers
 *
 * @private
 * @param {number} modifiers
 * @return {!String}
 **/
Post.prototype.format = function(modifiers)
{
    var cats = '';
    if (this.categories.length > 0) cats = '['+this.categories.join(",")+"]";
    var date = [1+this.date.getMonth(), '/', 
		this.date.getDate(), '/',
		this.date.getFullYear()-2000, ' ',
		this.date.getHours() % 12, ':',
		this.date.getMinutes() < 10 ? ('0'+this.date.getMinutes()) : this.date.getMinutes(), 
		(this.date.getHours() > 12) ? 'pm' : 'am'].join('');

    var title = this.title;
    if (modifiers&Post.Format.TitleLink) {
	title = ['<a class="titlelink" href="',
		 this.url,
		 '">',
		 title,
		 '</a>'].join('');
    }
    // if synopsis, limit to 256 characters
    var body, bodydiv;
    if (modifiers&Post.Format.Synopsis) {
	body = this.synopsis+'<a class="read-more" href="'+this.url+'">Read more &raquo;</a>';
	bodydiv = '<div class="post-synopsis">';
    } else {
	body = this.body;
	bodydiv = '<div class="post-content">';
    }
    var info = ['<div class="post">\n',
		'<div class="post-title">',
		title,
		'</div>',
		'<div class="post-date">',
		date,
		'</div>',
		'<div class="post-cat">',
		cats,
		'</div>',
		bodydiv,
		body,
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

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
