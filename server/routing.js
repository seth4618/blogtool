// define how to handle incoming requests that aren't just plain file server actions

function doPost(pathname, response, cb)
{
    FileServer.serve('/post.php', response);
    cb(null);
}

function doCat(pathname, response, cb)
{
    FileServer.serve('/cat.php', response);
    cb(null);
}

var actions = {
    'login': User.login,
    'newuser': User.makeUser
};


function doAction(pathname, response, cb)
{
    var args = pathname.split('/');
    args.splice(0,2);
    console.log('doAction: %j', args);
    if (args[0] in actions) {
        actions[args[0]](response, args);
    } else {
        response.err(404, "no req handler for "+pathname);
    }
    cb(null);
}

function doDir(pathname, response, cb)
{
    // see if index.php or index.html exist
    FileServer.checkServerPath(pathname+"index.php", function(exists) {
	if (exists) {
	    cb(pathname+"index.php");
	}
	else FileServer.checkServerPath(pathname+"index.html", function(exists) {
	    if (exists) {
		cb(pathname+"index.html");
	    }
	    else {
		response.err(404, pathname+" not found.");
		cb(null);
	    }
	});
    });
}

function doRest(pathname, response, cb)
{
    FileServer.checkServerPath(pathname, function(exists) {
	if (exists == 1) {
	    FileServer.serve(pathname, response);
	    cb(null);
	} else if (exists == 2) {
	    cb(pathname+"/");
	} else {
	    response.err(404, pathname+" not found.");
	    cb(null);
	    return;
	}
    });
}

module.exports = [
    {"^/a/": doAction},
    {"^/post/": doPost},
    {"^/cat/": doCat},
    {"/$": doDir},
    {".": doRest}
];


// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
