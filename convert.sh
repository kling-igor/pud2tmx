#!/bin/bash

files=(
"human_1.txt"
"human_10.txt"
"human_11.txt"
"human_12.txt"
"human_13.txt"
"human_14.txt"
"human_2.txt"
"human_3.txt"
"human_4.txt"
"human_5.txt"
"human_6.txt"
"human_7.txt"
"human_8.txt"
"human_9.txt"
"orc_1.txt"
"orc_10.txt"
"orc_11.txt"
"orc_12.txt"
"orc_13.txt"
"orc_14.txt"
"orc_2.txt"
"orc_3.txt"
"orc_4.txt"
"orc_5.txt"
"orc_6.txt"
"orc_7.txt"
"orc_8.txt"
"orc_9.txt"
)

for file in "${files[@]}"; do
  npm start -- "./${file}"
done