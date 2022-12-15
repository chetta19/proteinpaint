drop table if exists sample;
create table sample (
  id integer primary key not null,
  name character varying(100) not null
);

drop table if exists sampleidmap;
create table sampleidmap (
  id integer not null,
  name character varying(100) not null,
  primary key(id, name),
  foreign key(id) references sample(id)
);


drop table if exists terms;
create table terms (
  id character varying(100) not null primary key,
  name character varying(100) not null,
  parent_id character varying(100),
  jsondata json not null,
  child_order integer not null,
  type text,
  isleaf integer,
  foreign key(parent_id) references terms(id)

);

drop table if exists ancestry;
create table ancestry (
  term_id character varying(100) not null,
  ancestor_id character varying(100) not null,
  primary key(term_id, ancestor_id)
  foreign key(term_id) references terms(id),
  foreign key(ancestor_id) references terms(id)
);



-- may add term group and color etc
drop table if exists alltermsbyorder;
create table alltermsbyorder (
  group_name character not null,
  id character varying(100) primary key not null,
  foreign key(id) references terms(id)
);


DROP TABLE IF EXISTS termhtmldef;
CREATE TABLE termhtmldef (
  id character primary key not null,
  jsonhtml json not null,
  foreign key(id) references terms(id)

);


drop table if exists category2vcfsample;
create table category2vcfsample (
  subcohort character not null,
  group_name character not null,
  term_id character varying(100) not null,
  parent_name character varying(200) null,
  q text not null,
  categories text not null,
  primary key(subcohort, term_id, parent_name),
  foreign key(subcohort) references cohort(cohort),
  foreign key(term_id) references terms(id),
  foreign key(parent_name) references terms(id)
);


drop table if exists annotations;
create table annotations (
  sample integer not null,
  term_id character varying(100) not null,
  value character varying(255) not null,
  primary key(term_id, sample),
  foreign key(sample) references sample(id),
  foreign key(term_id) references terms(id)
);

drop table if exists chronicevents;
create table chronicevents (
  sample integer not null,
  term_id character varying(100) not null,
  grade integer not null,
  age_graded real not null,
  years_to_event real not null,
  primary key(term_id, sample),
  foreign key(sample) references sample(id),
  foreign key(term_id) references terms(id)
);


DROP TABLE IF EXISTS precomputed;
CREATE TABLE precomputed(
  sample integer not null,
  term_id TEXT not null,
  value_for TEXT,
  value TEXT,
  computable_grade integer,
  max_grade integer,
  most_recent integer,
  primary key(term_id, sample),
  foreign key(sample) references sample(id),
  foreign key(term_id) references terms(id)
);



---------------------------------------------
-- to build the subcohort_terms table
-- only required if cohort selection is enabled on the dataset
---------------------------------------------

DROP TABLE IF EXISTS subcohort_terms;
CREATE TABLE subcohort_terms (
 cohort TEXT not null,
 term_id TEXT not null,
 count INT,
 included_types TEXT,
 child_types TEXT,
--primary key(cohort, term_id),
foreign key(term_id) references terms(id)
);



DROP TABLE IF EXISTS survival;
CREATE TABLE survival(
 sample INT not null,
 term_id TEXT not null,
 tte INT, -- time-to-event
 exit_code INT, -- cohort defined exit code, may be 0=death, 1=censored, or similar
primary key(term_id, sample),
foreign key(sample) references sample(id),
foreign key(term_id) references terms(id)
);




