PRAGMA foreign_keys=ON;

drop table if exists anno_integer;
create table anno_integer (
  sample integer not null,
  term_id character varying(100) not null,
  value integer not null,
  primary key(term_id, sample),
  foreign key(term_id) references terms(id) on delete cascade,
  foreign key(sample) references samples(id) on delete cascade

);

-- copy entries from the annotations table
insert into anno_integer (sample, term_id, value) 
select sample, term_id, CAST(value as integer) 
from annotations a 
join terms t on t.id=a.term_id and t.type='integer';

create index anno_int_sample on anno_integer(sample);
create index anno_int_value on anno_integer(value);


-- compare the unique sample and term counts to verify
select '----   #annotated samples, #terms   ------';
select 'anno_integer', count(*), count(distinct(term_id))
from anno_integer;
select 'subcohort_term integer', sum(s.count), count(distinct(term_id)) 
from subcohort_terms s 
join terms t on t.id = s.term_id
-- exclude combined cohorts that will cause sample double counting
-- assumes combined cohort names have a comma-separator
-- !!! TODO: need a guaranteed way to detect combined cohorts !!!
where t.type = 'integer' and cohort not like '%,%';




----------------------------------

drop table if exists anno_float;
create table anno_float (
  sample integer not null,
  term_id character varying(100) not null,
  value REAL not null,
  primary key(term_id, sample),
  foreign key(term_id) references terms(id),
  foreign key(sample) references samples(id)

);
-- copy entries from the annotations table
insert into anno_float (sample, term_id, value) 
select sample, term_id, CAST(value as real) 
from annotations a 
join terms t on t.id=a.term_id and t.type='float';

create index anno_float_sample on anno_float(sample);
create index anno_float_value on anno_float(value);



-- compare the unique sample and term counts to verify
select '----   #annotated samples, #terms   ------';
select 'anno_float', count(*), count(distinct(term_id))
from anno_float;
select 'subcohort_term float', sum(s.count), count(distinct(term_id))
from subcohort_terms s 
join terms t on t.id = s.term_id 
-- exclude combined cohorts that will cause sample double counting
-- assumes combined cohort names have a comma-separator
-- !!! TODO: need a guaranteed way to detect combined cohorts !!!
where t.type = 'float' and cohort not like '%,%';

----------------------------------

drop table if exists anno_categorical;
create table anno_categorical (
  sample integer not null,
  term_id character varying(100) not null,
  value character varying(255) not null,
  primary key(term_id, sample),
  foreign key(term_id) references terms(id),
  foreign key(sample) references samples(id)
);

-- copy entries from the annotations table
insert into anno_categorical (sample, term_id, value) 
select sample, term_id, value 
from annotations a 
join terms t on t.id=a.term_id and t.type='categorical';

create index anno_cat_sample on anno_categorical(sample);
create index anno_cat_value on anno_categorical(value);

-- compare the unique sample and term counts to verify
select '----   #annotated samples, #terms   ------';
select 'anno_categorical', count(*), count(distinct(term_id))
from anno_categorical;
select 'subcohort_term categorical', sum(s.count), count(distinct(term_id)) 
from subcohort_terms s 
join terms t on t.id = s.term_id 
-- exclude combined cohorts that will cause sample double counting
-- assumes combined cohort names have a comma-separator
-- !!! TODO: need a guaranteed way to detect combined cohorts !!!
where t.type = 'categorical' and cohort not like '%,%';

