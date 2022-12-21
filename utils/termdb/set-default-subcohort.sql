delete from subcohort_terms;

insert into cohorts(cohort, name, abbrev, sample_count)
values('', '', '', 0);

insert into subcohort_terms (cohort, term_id, count)
select '', t.id, count(distinct a.sample)
from terms t
join annotations a ON a.term_id = t.id
group by t.id;

insert into subcohort_terms (cohort, term_id, count)
select '', p.ancestor_id, count(distinct a.sample)
from terms t
join annotations a ON a.term_id = t.id
join ancestry p ON p.term_id = t.id
group by p.ancestor_id;

insert into subcohort_terms (cohort, term_id, count)
select '', t.id, count(distinct s.sample)
from terms t
join survival s ON s.term_id = t.id
group by t.id;

insert into subcohort_terms (cohort, term_id, count)
select '', p.ancestor_id, count(distinct s.sample)
from terms t
join survival s ON s.term_id = t.id
join ancestry p ON p.term_id = t.id
group by p.ancestor_id;
