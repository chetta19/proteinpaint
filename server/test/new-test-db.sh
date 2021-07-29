#!/bin/bash

# !!! WARNING !!!
# Running this file may require changes to the
# expected test results in termdb-related tests. 

# call from where the clinical db file is located
rm -rf db2
cp db db2
# get the directory of the currently executing script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
sqlite3 db2 < $DIR/test-db.sql
sqlite3 db2 < $DIR/../../termdb/set-included-types.sql
