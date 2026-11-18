#!/usr/bin/env bash
out="$2/diff-$(basename "$1").tsv"
: > "$out"
for a in "$1"/*.webp; do
  name=$(basename "$a")
  b="$2/$name"
  if [ ! -f "$b" ]; then echo -e "missing\t-\t$name" >> "$out"; continue; fi
  if cmp -s "$a" "$b"; then echo -e "same\t0\t$name" >> "$out"; continue; fi
  sa=$(magick identify -format '%wx%h' "$a")
  sb=$(magick identify -format '%wx%h' "$b")
  if [ "$sa" != "$sb" ]; then echo -e "size\t$sa->$sb\t$name" >> "$out"; continue; fi
  px=$(magick compare -metric AE -fuzz 2% "$a" "$b" null: 2>&1 | cut -d' ' -f1)
  if [ "$px" = "0" ]; then echo -e "same\t0\t$name" >> "$out"; else echo -e "pixels\t$px\t$name" >> "$out"; fi
done
cut -f1 "$out" | sort | uniq -c
grep -v '^same' "$out" | sort -k1,1 -k2,2nr
