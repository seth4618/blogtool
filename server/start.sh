#!/bin/sh

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
sleep 3
as=`ps -ef | grep node | grep author | sed -re 's/[^0-9]*([0-9]+).*/\1/'`
echo "---------- author $as"
tail -10 ../logs/author.log
nohup node ./simpleblog.js > ../logs/sb.log 2>&1 &
sleep 3
ws=`ps -ef | grep node | grep simple | sed -re 's/[^0-9]*([0-9]+).*/\1/'`
echo "---------- simpleblog $ws"
tail -10 ../logs/sb.log
echo "----------"
echo "Started author server on $as"
echo "Started web server on $ws"
exit 0

