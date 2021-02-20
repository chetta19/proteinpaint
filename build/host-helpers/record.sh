#!/bin/bash

EVENT=$1
REV=$(cat active/public/rev.txt | cut -d' ' -f 2)

if [[ "$EVENT" == "deployed" ]]
  # if a revision has been recorded as being deployed previously,
  # it is considered a re-activation and not another deployment
	if [[ $(cat deployments.txt | grep -l "$REV") != "" ]]; then
		echo "$(cat active/public/rev.txt)" >> deployments.txt
	fi
fi

echo "$EVENT $REV $(date)" >> events.txt
