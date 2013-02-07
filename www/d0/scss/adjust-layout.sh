#!/bin/bash
rcol=30
mcol=60
lcol=10
pad=2
mcolm2pad=$((mcol-2*pad))
lcolm2pad=$((lcol-2*pad))
rcolm2pad=$((rcol-2*pad))
rcolp3pad=$((rcol+3*pad))
p100mlcolp5pad=$((100-lcol+5*pad))
backup=`date +"%Y-%m-%d-%H-%M-%S"`
cp layout-three.css .${backup}-layout-three.css
sed -e "s/<mcol>/$mcol/" -e "s/<rcol>/$rcol/" -e "s/<lcol>/$lcol/" -e "s/<mcol-2pad>/$mcolm2pad/" -e "s/<lcol-2pad>/$lcolm2pad/" -e "s/<rcol+3pad>/$rcolp3pad/"  -e "s/<rcol-2pad>/$rcolm2pad/" -e "s/<100-lcol+5pad>/$p100mlcolp5pad/" < layout-three.template > layout-three.css
exit 0
