#!/usr/bin/perl

my ($prog) = ($0 =~ m!([^/]+)$!);
my $verbose = 0;

use File::Slurp;
my $input = read_file($ARGV[0]);
$input =~ s/.*\\begin\{document\}//ms;
$input =~ s/\\end\{document\}.*//ms;
$input =~ s/%.*$//gm;
@pieces = split(/(\\begin{[^}]+})/, $input);
$fn = 1;
$output = "";
for ($i=0; $i<=$#pieces; $i++) {
    $p = $pieces[$i];
    #print "$i:[".substr($p, 0, 10)."]\n";
    ($type) = $p =~ /\\begin{(.*)}/;
    if ($p =~ /^\\begin/) {
	($content, $rest) = $pieces[$i+1] =~ /(.*?)\\end.$type.(.*)/ms;
	#print "\\begin{$type}: [".substr($content, 0, 10)."]"."[".substr($rest, 0, 10)."]\n";
	if ($type eq "center") {
	    $content =~ s/\n/\n## /gm;
	    $content = "## ".$content;
	} elsif ($type eq "quote") {
	    $content =~ s/\n/\n> /gm;
	    $content = "> ".$content;
	} elsif ($type eq "tightitemize") {
	    $content =~ s/\\item/+ /g;
	} elsif ($type eq "tightdescription") {
	    $content =~ s/\\item/+ /g;
	} else {
	    die("Unknown start $p");
	}
	$output .= ($content."\n".$rest);
	$i++;
    } else {
	$output .= $p;
    }
}
# now deal with footnotes
@fns = ();
@pieces = split(/(\\footnote{)/, $output);
$output = "";
for ($i=0; $i<=$#pieces; $i++) {
    $p = $pieces[$i];
    if ($p =~ /\\footnote{/) {
	$output .= "<sup>[".$fn."](#footnote$fn)</sup><A name=\"back$fn\">";
	($text, $rest) = $pieces[$i+1] =~ /(.*?)}(.*)/s;
	@fns[$fn] = $text;
	$output .= $rest;
	$i++;
	$fn++;
    } else {
	$output .= $p;
    }
}
if ($fn > 1) {
    $output .= "\n***\nFootnotes:\n";
    for ($i=1; $i<$fn; $i++) {
	$output .= "\n$i. <A Name=\"footnote$i\">".$fns[$i]." [return to main text](#back$i)\n";
	
    }
}

# deal with some \ sequences
$output =~ s/{\s*\\/{\\/g;
@pieces = split(/({*\\[a-zA-Z0-9_]+)/, $output);
$output = "";
$false = 0;
for ($i=0; $i<=$#pieces; $i++) {
    $p = $pieces[$i];
    print STDERR "$i:$false:[".substr($p, 0, 20)."]\n";
    if ($p =~ /^{*\\/) {
	($brace, $cmd) = $p =~ /({*)\\([a-zA-Z0-9_]+)/;
	$group = "";
	$rest = "";
	$q = "";
	if ($brace) {
	    $q = $pieces[$i+1];
	    if ($q =~ /^{*\\/) {
		die("Can't handle multiple \\cmd in a row");
	    }
	    ($group, $rest) = $q =~ /(.*?)}(.*)/s;
	    $i++;
	}
	if ($cmd eq "Large") {
	    $false && next;
	    # do nothing special for now
	    $output .= "$group $rest";
	} elsif ($cmd eq "em") {
	    $false && next;
	    $group =~ s/^\s*//g;
	    $group =~ s/\s*$//g;
	    $output .= "*$group"."* ".$rest;
	} elsif ($cmd eq "noindent") {
	    $false && next;
	    # do nothing special for now
	    $output .= "$group $rest";
	} elsif ($cmd eq "iffalse") {
	    $false++;
	} elsif ($cmd eq "fi") {
	    $false--;
	    if ($false == 0) {
		print "$q";
	    }
	} else {
	    print STDERR "Can't process $cmd, leaving\n";
	    $output .= "$p$q";
	}
    } else {
	$false && next;
	$output .= $p;
    } 
}

# deal with special characters
$output =~ s/``/&ldquo;/g;
$output =~ s/''/&rdquo;/g;
$output =~ s/---/&mdash;/g;
$output =~ s/--/&ndash;/g;
$output =~ s/\\\\/\n/g;
print $output;

