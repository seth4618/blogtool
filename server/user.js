////////////////////////////////////////////////////////////////
// class User

var crypto = require('crypto');
var Util = require('./util.js');
var GenCache = require('./gencache.js');

/**
 * User
 * keep track of users logged into system
 *
 * @constructor
 * @extends {DatabaseBackedObject}
 * @implements {FrontEndObject}
 **/
function User() 
{
}
Util.inherits(User, DatabaseBackedObject);

//////////////// class vars

/** @typedef {!string} */
User.ID;

/** 
 * @type{Array.<!string>} 
 * @const
 */
User.dbFields = [ 'name', 'firstName', 'lastName', 'image', 'email', 'perms', 'salt', 'passwd'];

/** 
 * @type{!string}
 * @const
 */
User.table = 'user';

/**
 * @enum {number}
 * @const
 */
User.Permission = {
	superuser: 16,
	member: 1
};

/** @type {!GenCache} */ User.directory = new GenCache("Users", User, 240);

//////////////// instance vars

/** @type {User.ID} */ User.prototype.id;
/** @type {!string} */ User.prototype.name;
/** @type {!string} */ User.prototype.firstName;
/** @type {!string} */ User.prototype.lastName;
/** @type {!string} */ User.prototype.image;
/** @type {!string} */ User.prototype.email;
/** @type {!User.Permission} */ User.prototype.perms;
/** @type {!string} */ User.prototype.salt;
/** @type {!string} */ User.prototype.passwd;

//////////////// class methods

/**
 * make
 *
 * make a new user and insert into db
 *
 * @param {!string} name
 * @param {!string} firstName
 * @param {!string} lastName
 * @param {!string} email
 * @param {!User.Permission} perms
 * @param {!string} image
 * @param {!string} salt
 * @param {!string} passwd
 * @param {!Function=} cb
 * @return {!User}
 */
User.make = function(name, firstName, lastName, email, perms, image, method, key, salt, cb)
{
    var user = new User();
    user.email = email;
    user.name = name;
    user.firstName = firstName;
    user.lastName = lastName;
    user.perms = perms;
    user.image = image;
    user.salt = salt;
    user.passwd = passwd;
    try{
	this.insert(cb);
    } catch (e) {
        Util.error('error creating user: ' + e);
    }
    return user;
};

/**
 * insert
 *
 * @param {function(User)=} cb
 */
User.prototype.insert = function(cb){
     db.insert(User.table, this, cb);
};

/**
 * hashPass
 * 
 * Calculates md5 hash with the password specified. If salt is not specififed, one will be generated 
 * and returned.
 *
 * @param {!string} pass
 * @param {string=} salt
 * @return {{pass : !string, salt : !string}}
 **/
User.hashPass = function(pass, salt) {
    salt = salt || ((Math.random() * 100000)+'').split('.')[0];
    pass += (pass + salt);
    var md = crypto.createHash('md5');
    md.update(pass);
    var newpass = md.digest('hex');
    x = {pass : newpass, salt : salt};
    console.log('%s + %s -> %j', pass, salt, x);
    return x;
};

/**
 * find
 * find the user related to this id
 *
 * @param {!(string|DBID)} id
 * @param {function(User)} cb
 **/
User.find = function(id, cb)
{
    try {
	db.find(User.table, id, User.directory, cb);
    } catch (err) {
	Util.info('at user with error '+err+"\n"+err.stack);
	cb(null);
    }
};

/**
 * findByEmail
 * find the user by email
 *
 * @param {!string} email
 * @param {function(User)} cb
 **/
User.findByEmail = function(email, cb)
{
    db.advancedQuery(User.table, {email: email}, {_id: 1}, {}, function(results) {
	if ((results)&&(results.length == 1)) {
	    User.find(results[0]._id, cb);
	} else {
	    cb(null);
	}
    });
};

/**
 * setCookie
 *
 * @param {!Responder} response
 * @param {!string} uid
 **/
User.setCookie = function(response, uid) {
    var cookie = response.getCookies();
    var neverExpire = new Date();
    neverExpire.setDate(neverExpire.getDate() + 30);
    cookie.set(BaseCookie, uid, {expires:neverExpire, httpOnly:false, domain : '.' + Hostname});
    response.sendP3P();
};

/**
 * setCookie
 * set the BaseCookie cookie with the uid
 *
 * @param {!Responder} response
 **/
User.prototype.setCookie = function(response) {
    User.setCookie(response, this.id);
};

/**
 * login
 * this logs user in. return null if no such user
 *
 * @param {!Responder} response
 * @param {!Array.<!string>} args
 **/
User.login = function(response, args, aw)
{
    // args[1]: email
    // args[2]: password
    var key = decodeURIComponent(args[1]);//email
    var token = decodeURIComponent(args[2]);//password
    var success = function(user) {
        user.setCookie(response, user.id);
        response.returnJSON(user.forFrontEnd());
    };
    User.findByEmail(key, function(user) {
	console.log('%s -> %j', key, user);
	if (user) {
	    x = User.hashPass(token, user.salt);
	    console.log('passwd: %j', x);
	    if (x.pass == user.passwd) {
		success(user);
		return;
	    } 
	}
        response.returnJSON(null);
    });
};

/**
 * login
 * this logs user in. return illegal method/key if no such user
 *
 * @param {!Responder} response
 * @param {!Array.<!string>} args
 **/
User.makeUser = function(response, args, aw)
{
    // args[1]: first
    // args[2]: last
    // 3: email
    // 4: perms
    // 5: passwd
    var success = function(user) {
        user.setCookie(response, user.id);
        response.returnJSON(user.forFrontEnd());
    };
    User.findByEmail(key, function(user) {
	if (user) {
            response.returnJSON(null);
	    return;
	}
	user = new User();
	user.name = args[1]+args[2].substr(0,1);
	user.firstName = args[1];
	user.lastName = args[2];
	user.image = '';
	user.email = decodeURIComponent(args[3]);
	user.perms = (args[3] == 's') ? User.Permission.superuser : User.Permission.member;
	var x = User.hashPass(decodeURIComponent(args[4]));
	user.salt = x.salt;
	user.passwd = x.pass;
	user.insert(function() { console.log('inserted'); response.returnJSON(1); });
    });
};

/**
 * forFrontEnd
 * convert the object into something for the front-end
 *
 * @return {Object}
 **/
User.prototype.forFrontEnd = function()
{
    var record = {};
    record.id = this.id;
    record.img = this.image;
    record.name = this.name;
    record.firstName = this.firstName;
    record.lastName = this.lastName;
    record.perms = this.perms;
    record.email = this.email;
    return record;
};

/**
 * convertToDB
 * @param {!function(!Object)} cb
 * @param {Array.<!string>=} using
 */
User.prototype.convertToDB = function(cb, using)
{
    var me = this;
    DatabaseBackedObject.prototype.convertToDB.call(this, 
                                                    cb,
		                                    User.dbFields);
};

/**
 * convertFromDB
 *
 * @param {Object} record	data from DB
 * @param {function(!User)=} cb	if specified, call back when conversion is done
 */
User.prototype.convertFromDB = function(record, cb){
    var i;
    for (i in User.dbFields) {
        var key = User.dbFields[i];
        this[key] = record[key];
    }
    if (! record.firstName) {
        this.firstName = '';
    } 
    if (! record.lastName) {
        this.lastName = '';
    }
    if (cb) cb(this);
};

/**
 * update
 *
 * generic update function for simple updates
 *
 * @param{Array.<!string>} fields
 */
User.prototype.update = function(fields){
    var toset = {};
    for (var i in fields) {
        toset[fields[i]] = this[fields[i]];
    }
    var update = {
        $set : toset
    };
    udb.rawupdate(User.table, {_id : this._id}, update);
};

/**
 * deleteMe
 * called when we want to delete this object
 *
 **/
User.prototype.deleteMe = function()
{
    //nothing special to do
};

/**
 * changePassword
 * 
 * Set the password specified for the user associated with the email address.
 *
 * Include an action id if this is a 'forgot password' situation.
 * 
 * @param {!Responder} response
 * @param {!Array.<!string>} args
 * @param {ActiveWidget} aw
 * @param {http.ServerRequest} request
 **/
User.setPass = function(response, args, aw, request){
    var email = decodeURIComponent(args[0]);
    var newpass = decodeURIComponent(args[1]);
    var actionId = null;
    if (args.length == 3) {
        actionId = args[2];
    }
    var setpass = function(user){
        if (user.email != email) {
            Util.error('BIG problem, user email in api request does not match user that is logged in. -' + user.id + '-' + user.email + '-' + email);
            response.returnJSON(false);
        } else {
            var passSalt = User.hashPass(newpass);
            ForeignService.add(LoginMethod.flashgroup, passSalt.pass, user, passSalt.salt, email);
            response.returnJSON(true);
        }
    };
    if (actionId != null) {
        UserAction.getById((/**@type{!DBID} */actionId), function(action){
            if (action) {
                User.findByEmail(email, function closure_user_1454(user) {
                    if (user) {
                        setpass(user);
                    } else {
                        response.returnJSON(false);
                    }
                    UserAction.setInvalid((/**@type{!DBID} */actionId));
                });
            } else {
                response.returnJSON(false);
            }
        });
    } else {
        User.getFromSession(response, request, function closure_user_1386(user) {
            setpass(user);
        });
    }
};

/**
 * resetCookie
 * 
 * change cookie to that of user as arg[1]
 * 
 * @param {!Responder} response
 * @param {!Array.<!string>} args
 * @param {ActiveWidget} aw
 * @param {http.ServerRequest} request
 **/
User.resetCookie = function(response, args, aw, request){
    User.find(args[0], function closure_user_1501(user) {
            user.setCookie(response);
            response.returnJSON(0);
        });
};

module.exports = User;

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
