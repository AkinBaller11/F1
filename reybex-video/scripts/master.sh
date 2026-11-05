#!/bin/sh
# Mastert die Tonspur eines gerenderten Videos: weniger Sub-Bass, mehr Präsenz
# (hörbar auf Handy-Lautsprechern), Lautheit -14 LUFS. Video wird nur kopiert.
# Aufruf: sh scripts/master.sh <eingang.mp4> <ausgang.mp4>
set -e
ffmpeg -v error -y -i "$1" -c:v copy \
  -af "highpass=f=40,lowshelf=f=110:g=-5,equalizer=f=900:t=q:w=1.2:g=2,equalizer=f=2600:t=q:w=1:g=5,equalizer=f=6500:t=q:w=1:g=2,loudnorm=I=-14:TP=-1.2:LRA=9" \
  -c:a aac -b:a 256k -ar 48000 -ac 2 -movflags +faststart "$2"
