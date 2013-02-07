#!/bin/sh
prog=$0
verbose=0
nosleep=0
here=0
while [ "$#" -gt "0" ]
do
    if [ ${1#-} == $1 ]; then
	break;
    fi
    opt=$1
    case $opt in 
	--here)
	    here=1;
	    nosleep=1;
	    shift;
	    ;;
	--fast)
	    nosleep=1;
	    shift;
	    ;;
	-v)
	    verbose=1
	    ;;
	*)
	    echo "Unknown option: $opt"
	    echo "--fast"
	    echo "-v: verbose"
	    exit;
	    ;;
    esac
done

as=`ps -ef | grep node | grep author | sed -re 's/[^0-9]*([0-9]+).*/\1/'`
ws=`ps -ef | grep node | grep simple | sed -re 's/[^0-9]*([0-9]+).*/\1/'`
if [ "x$as" == "x" ]; then
  echo "no author server running"
else
  echo "Killing author server on $as"
  kill $as
fi

if [ "x$ws" == "x" ]; then
  echo "no web server running"
else
  echo "Killing web server on $ws"
  kill $ws
fi
nohup node ./author.js > ../logs/author.log 2>&1 &
if [ $nosleep == 0 ]; then sleep 3; fi
as=`ps -ef | grep node | grep author | sed -re 's/[^0-9]*([0-9]+).*/\1/'`
echo "---------- author $as"
tail -10 ../logs/author.log
if [ $here == 1 ]; then
    node ./simpleblog.js
else
    nohup node ./simpleblog.js > ../logs/sb.log 2>&1 &
fi
if [ $nosleep == 0 ]; then sleep 3; fi
ws=`ps -ef | grep node | grep simple | sed -re 's/[^0-9]*([0-9]+).*/\1/'`
echo "---------- simpleblog $ws"
tail -10 ../logs/sb.log
echo "----------"
echo "Started author server on $as"
echo "Started web server on $ws"
exit 0

