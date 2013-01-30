/**
 * Synchronizer
 * a class to make it easier to wait for many things to complete over time
 *
 * @constructor
 * @param {!function()} cb		cb executed when everything is done
 * @param {number=} 	initVal		initial number of tasks to wai ton
 * @param {!string=} 	msg		msg for debugging
 **/
function Synchronizer(cb, initVal, msg)
{
    this.left = initVal || 0;
    this.whenDone = cb;
    this.msg  = msg || "";
	if (Synchronizer.debug) {
		this.id = Synchronizer.uid++;
        this.gen = 0;
		Synchronizer.all[this.id] = this;
	}
}

/** @type {number} */ Synchronizer.prototype.left;
/** @type {!function()} */ Synchronizer.prototype.whenDone;
/** @type {!string} */ Synchronizer.prototype.msg;

/** @type {Object.<number, !Synchronizer>} */ 
Synchronizer.all = {};

/** @type {number} */ 
Synchronizer.uid = 0;

/** @type {number} 
 *  @const
 */ 
Synchronizer.debug = 1;

/** @type {number} 
 */ 
Synchronizer.intervalID;

if (Synchronizer.debug) {
    Synchronizer.scount = 0;
	Synchronizer.intervalID = setInterval(function closure_mdb_739() {
		var id;
		if (Synchronizer.scount++ > 10) {
            Util.info("checking syncs");
            Synchronizer.scount = 0;
        }
		for (id in Synchronizer.all) {
			var s = Synchronizer.all[(/** @type {number} */ id)];
            if (s.gen > 3) {
				Util.error("slow synchronizer: "+id+": "+s.msg+": "+s.left+"\t: "+s.gen);
                if (s.gen > 10) {
                    s.whenDone = function() {};
                    delete Synchronizer.all[(/** @type {number} */id)];
                }
            }
            s.gen++;
		}
	}, 60000);
}

/**
 * wait
 * How many more things to wait for before we execute the whenDone function
 *
 * @param {!number} cnt		if not specified, wait for one more thing
 * @param {!string=} p		if not specified, one more thing completed
 **/
Synchronizer.prototype.wait = function(cnt, p) 
{
    this.left += cnt;
    p = p || "";
    //Util.info("synch:"+this.msg+":"+p+":"+this.left);
};

/**
 * done
 * how many tasks have been completed
 *
 * @param {!number} cnt		if not specified, one more thing completed
 * @param {!string=} p		if not specified, one more thing completed
 **/
Synchronizer.prototype.done = function(cnt, p) 
{
    this.left -= cnt;
    p = p || "";
    //Util.info("synch:"+this.msg+":"+p+":"+this.left);
    if (this.left == 0) {
		var f = this.whenDone;
		Util.assert(f != null, "called sync.done() more than once??? "+this.msg+p);
		this.whenDone = (/** @type {function()} */ null);
		//Util.info("synch:"+this.msg+p+":"+": issuing callback");
		if (Synchronizer.debug) {
			delete Synchronizer.all[this.id];
		}
		f();
    } else if (this.left < 0) {
        Util.error("synch:"+this.msg+":"+p+":"+": HAS NEGATIVE COUNT"+this.left+" from "+cnt);
        throw new Error('Negative count');
    }
};

module.exports = Synchronizer;

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
