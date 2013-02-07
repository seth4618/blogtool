nodemailer = require("nodemailer");
Util = require("./util.js");
var Config = require("./config.js");
Config.init('../data/config.txt');
Config.require(['sesinfo', 'mailfrom', 'mailto']);
var argv = require('optimist')
    .usage('sendmail.js [-v] [-b] [-s subject]')
    .describe('v', 'verbose')
    .describe('b', 'no body')
    .describe('s', 'subject (default is hostname says trouble')
    .argv;

// get SES transport object
var transport = nodemailer.createTransport("SES", Config.get('sesinfo'));

var hostname = require('os').hostname();
var subject = argv.s;
var text = '';
if (subject == undefined) subject = "Mail from "+hostname; else subject = hostname+":"+subject;
// if -b, then send empty body, other wise read body and then send
if (argv.b) sendmail(''); else getbody();

// read the body from stdin and then sendmail
function getbody() {
    // get whatever is on stdin
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', function (chunk) {
	text += chunk;
    });
    
    process.stdin.on('end', function () {
	sendmail(text);
    });
}

// send the actual mail.  subject is a global var.  Naughty Naughty
function sendmail(text) 
{
    if (text == '') text = '--no body--';
    var to = Config.getString('mailto');
    console.log('Sending [%s]\n[%s] to %s\n', subject, text, to);
    transport.sendMail({from: Config.getString('mailfrom'),
			to: to,
			subject: subject,
			text: text
		       },
		       function(error, response){
			   if(error){
			       console.log(error);
			   }else{
			       console.log("Message sent: " + response.message);
			   }
			   Util.exit(0);
		       });
}
		      

// Local Variables:
// tab-width: 4
// indent-tabs-mode: nil
// End:
