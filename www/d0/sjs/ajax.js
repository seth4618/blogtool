/**
 * Ajax
 * A class to issue ajax calls to the node server
 *
 * @constructor
 **/
function Ajax()
{
}

/** @type {!string} 
 *  @const
 */
Ajax.url = 'http://' + window.location.hostname;

/** @type {number} */ 
Ajax.seq = 0;

/**
 * change this if you want to make all ajax calls jsonp
 *
 * @type {boolean}
 */
Ajax.defaultJsonp = false;

/**
 * success
 * what to do on an ajax success
 *
 * @private
 * @param {*} reply
 * @param {Function=} cb
 **/
Ajax.success = function(reply, cb) 
{
    if(cb === undefined){
	Console.log("NO CB: return");
    }else{
	cb(reply);
    }
};

Ajax.cancel = function(xhr)
{
    Console.log('canceling');
    Ajax.cancelXHR = xhr;
    xhr.abort();
    Console.log('done with cancel:'+Ajax.cancelXHR);
}

/**
 * error
 * what to do on an ajax error
 *
 * @private
 * @param {!XMLHttpRequest} jqXHR
 * @param {!string} textStatus
 * @param {!string} errorThrown
 * @param {string|undefined} where
 * @param {!string} url
 * @param {!Object|Array.<*>} args			arguments to the call
 * @param {Function=} cb
 **/
Ajax.error = function(jqXHR, textStatus, errorThrown, where, url, args, cb)
{
    if (jqXHR == Ajax.cancelXHR) {
        Console.log('canceling');
        Ajax.cancelXHR = null;
        return;
    }
    where = where || "don't know where";
    Console.log("Ajax error:"+where+":"+textStatus+","+errorThrown+":"+url); 
    if(cb === undefined){
	//Console.log("NO CB: return from: "+where); 
    }else{
	cb({status: -1});
    }
};

/**
 * get
 * get info from the default server
 *
 * @param {string} command			command to issue
 * @param {!Array.<*>} args			arguments to the call
 * @param {string} where			for debugging
 * @param {Function=} cb			callback for results
 * @param {boolean=} useJsonP			set to true if you want jsonp
 * @param {boolean=} ssl			set to true if you want ssl
 * @return {!Object}
 **/
Ajax.get = function(command, args, where, cb, noUserArgs, ssl)
{
    if (useJsonP === undefined) {
        noUserArgs = Ajax.defaultJsonp;    
    }
    ssl = ssl || false;
    return Ajax.privateGet(command, args, where, cb, noUserArgs, Ajax.url, ssl);
};

/**
 * privateGet: helper for get
 *
 * @private
 * @param {string} command			command to issue
 * @param {!Array.<*>} args			arguments to the call
 * @param {string} where			for debugging
 * @param {(Function|undefined)} cb		callback for results
 * @param {boolean} useJsonP			set to true if you want jsonp
 * @param {!string} hosturl
 * @param {!boolean=} ssl
 * @return {!Object}
 **/
Ajax.privateGet = function(command, args, where, cb, noUserArgs, hosturl, ssl)
{
    ssl = ssl || false;
    var aurl = [hosturl, "a", Ajax.seq++, command].concat(args);
    var url = aurl.join('/');
    if (ssl) {
        url = url.replace(/^http:\/\//, 'https://');
    }
    Console.log("Getting: "+url);
    var handle = $.ajax({
        url: url,
        cache: false,
        dataType: useJsonP ? 'jsonp' : 'json',
        success: function ajaxsuc1(reply) { Ajax.success(reply, cb); },
	error: function ajaxerr1(jqXHR, textStatus, errorThrown) { Ajax.error(jqXHR, textStatus, errorThrown, where, url, args, cb); }
    });
    return handle;
};

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:



