.mode tab


drop table if exists terms;
drop index if exists terms_id;
drop index if exists terms_p;
drop index if exists terms_n;
drop index if exists ancestry_tid;
drop index if exists ancestry_pid;
create table terms (
  id character varying(100) not null,
  name character varying(100) not null collate nocase,
  parent_id character varying(100),
  jsondata json not null
);
drop table if exists ancestry;
create table ancestry (
  term_id character varying(100) not null,
  ancestor_id character varying(100) not null
);

.import termdb terms
.import ancestry ancestry

update terms set parent_id=null where parent_id='';
create index terms_id on terms(id);
create index terms_p on terms(parent_id);
create index terms_n on terms(name);
create index ancestry_tid on ancestry(term_id);
create index ancestry_pid on ancestry(ancestor_id);



-- may add term group and color etc
drop table if exists alltermsbyorder;
create table alltermsbyorder (
  id character varying(100) not null
);
.import alltermsbyorder alltermsbyorder


drop table if exists category2vcfsample;
create table category2vcfsample (
  term_id character varying(100) not null,
  q json null,
  category2sample json not null
);
.import category2vcfsample category2vcfsample




drop table if exists annotations;
drop index if exists a_sample;
drop index if exists a_termid;
drop index if exists a_value;
create table annotations (
  sample character varying(50) not null,
  term_id character varying(100) not null,
  value character varying(255) not null
);

.import annotation.matrix annotations
.import annotation.admix annotations

create index a_sample on annotations(sample);
create index a_termid on annotations(term_id);
create index a_value on annotations(value);



drop table if exists chronicevents;
drop index if exists c_sample;
drop index if exists c_termid;
drop index if exists c_grade;
create table chronicevents (
  sample character varying(50) not null,
  term_id character varying(100) not null,
  grade integer not null,
  age_graded real,
  years_to_event real
);

.import annotation.outcome chronicevents

create index c_sample on chronicevents(sample);
create index c_termid on chronicevents(term_id);
create index c_grade on chronicevents(grade);




DROP TABLE IF EXISTS precomputed;
CREATE TABLE precomputed(
  sample TEXT,
  term_id TEXT,
  value_for TEXT,
  value TEXT,
  restriction TEXT
);
CREATE INDEX p_sample on precomputed(sample);
CREATE INDEX p_termid on precomputed(term_id);
CREATE INDEX p_value_for on precomputed(value_for);
CREATE INDEX p_restriction on precomputed(restriction);

-- imported filename must match the 
-- dataset/sjlife2.hg38.js:cohort.termdb.precomputed_file value
.import chronicevents.precomputed precomputed
