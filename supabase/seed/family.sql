-- Sample data for the family pilot. Run once against a fresh database.
-- Replace :teacher_user_id and :teacher_email with the teacher's auth user.
-- Names are placeholders; rename students and the teacher in the app.

with t as (
  insert into public.teachers (user_id, name, studio_name)
  values (:'teacher_user_id', '', 'Home Studio')
  on conflict (user_id) do update set studio_name = excluded.studio_name
  returning id
),
p as (
  insert into public.parents (teacher_id, name, email, user_id, supervises_practice)
  select id, 'David', :'teacher_email', :'teacher_user_id', true from t
  returning id
),
s as (
  insert into public.students (teacher_id, name, instrument, age, method, current_book, goals, lesson_day, lesson_time)
  select id, 'Piano student', 'piano', null::int, 'Suzuki', 'Suzuki Piano Book 1',
         'Steady hand position and a singing tone. Daily listening.', 'Every day', 'After school' from t
  union all
  select id, 'Cello student', 'cello', null::int, 'Suzuki', 'Suzuki Cello Book 1',
         'Relaxed bow hold and clean string crossings.', 'Every day', 'After school' from t
  returning id, instrument
)
insert into public.student_parents (student_id, parent_id)
select s.id, p.id from s, p;

-- Repertoire
insert into public.repertoire (student_id, title, book, status, started_on, last_played_on)
select s.id, r.title, 'Suzuki Piano Book 1', r.status::public.repertoire_status, r.started, r.played
from public.students s
join (values
  ('Twinkle, Twinkle, Little Star Variations', 'review', date '2026-08-10', date '2026-10-24'),
  ('Lightly Row', 'review', date '2026-09-01', date '2026-10-22'),
  ('The Honeybee', 'review', date '2026-09-14', date '2026-10-10'),
  ('Cuckoo', 'polishing', date '2026-09-28', date '2026-10-24'),
  ('Lightly Row (left hand)', 'learning', date '2026-10-15', date '2026-10-24')
) as r(title, status, started, played) on true
where s.instrument = 'piano';

insert into public.repertoire (student_id, title, book, status, started_on, last_played_on)
select s.id, r.title, 'Suzuki Cello Book 1', r.status::public.repertoire_status, r.started, r.played
from public.students s
join (values
  ('Twinkle, Twinkle, Little Star Variations', 'review', date '2026-07-20', date '2026-10-24'),
  ('Lightly Row', 'review', date '2026-08-15', date '2026-10-03'),
  ('Song of the Wind', 'review', date '2026-09-01', date '2026-10-22'),
  ('Go Tell Aunt Rhody', 'polishing', date '2026-09-20', date '2026-10-24'),
  ('O Come, Little Children', 'learning', date '2026-10-12', date '2026-10-24')
) as r(title, status, started, played) on true
where s.instrument = 'cello';

-- Approved lesson, piano, Oct 24
with l as (
  insert into public.lessons (student_id, teacher_id, lesson_date, duration_minutes, status, summary, focus_points, suggestions, teacher_notes, parent_message, next_lesson_date, approved_at)
  select s.id, s.teacher_id, date '2026-10-24', 25, 'approved',
    'Reviewed Twinkle Variation A and Lightly Row with a round hand. Polished Cuckoo, working on the rests. Started the left hand of Lightly Row, first two measures.',
    'Keep the wrist level and the fingers curved. Count the rests out loud in Cuckoo.',
    'If the left hand is steady, put hands together for measures 1 and 2 of Lightly Row. Check thumb position on Variation A.',
    'Tends to collapse the fifth finger when tired. Stop before that point.',
    'Short and happy beats long and tired. Stop while it is still fun.',
    date '2026-10-26', now()
  from public.students s where s.instrument = 'piano'
  returning id, student_id
),
pcs as (
  insert into public.lesson_pieces (lesson_id, title, activity, notes, sort_order)
  select l.id, v.title, v.activity::public.piece_activity, v.notes, v.n from l,
  (values
    ('Twinkle Variation A', 'reviewed', 'Round hand, good tone', 1),
    ('Lightly Row', 'reviewed', null, 2),
    ('Cuckoo', 'polished', 'Rests still rushed', 3),
    ('Lightly Row (left hand)', 'started', 'Measures 1 and 2', 4)
  ) as v(title, activity, notes, n)
  returning id
)
insert into public.assignments (lesson_id, student_id, kind, title, how, every_day, sort_order)
select l.id, l.student_id, v.kind::public.assignment_kind, v.title, v.how, true, v.n from l,
(values
  ('review', 'Twinkle Variation A and Lightly Row', 'Once each, slowly, with a round hand', 1),
  ('piece', 'Cuckoo', 'Three times. Count the rests out loud: one, two', 2),
  ('piece', 'Lightly Row, left hand, measures 1 and 2', 'Five slow times, curved fingers', 3),
  ('listening', 'Book 1 recording, tracks 1 to 6', 'At breakfast or in the car', 4)
) as v(kind, title, how, n);

-- Approved lesson, cello, Oct 24
with l as (
  insert into public.lessons (student_id, teacher_id, lesson_date, duration_minutes, status, summary, focus_points, suggestions, teacher_notes, parent_message, next_lesson_date, approved_at)
  select s.id, s.teacher_id, date '2026-10-24', 30, 'approved',
    'Worked on the bow hold with the rocket game. Reviewed Twinkle Variation A and Song of the Wind. Polished Go Tell Aunt Rhody. Learned the first line of O Come, Little Children.',
    'Keep the pinky curved on the bow during string crossings. Slow and relaxed beats fast and tight.',
    'Check the bow hold first. If stable, add line 2 of O Come, Little Children. Lightly Row has not been reviewed in three weeks.',
    'Gets frustrated on string crossings when rushed. The game resets the mood.',
    'Praise every steady string crossing. Stop before frustration.',
    date '2026-10-26', now()
  from public.students s where s.instrument = 'cello'
  returning id, student_id
),
pcs as (
  insert into public.lesson_pieces (lesson_id, title, activity, notes, sort_order)
  select l.id, v.title, v.activity::public.piece_activity, v.notes, v.n from l,
  (values
    ('Twinkle Variation A', 'reviewed', null, 1),
    ('Song of the Wind', 'reviewed', 'Good up-bow retakes', 2),
    ('Go Tell Aunt Rhody', 'polished', 'Even bow speed on the long notes', 3),
    ('O Come, Little Children', 'started', 'Line 1 only', 4)
  ) as v(title, activity, notes, n)
  returning id
)
insert into public.assignments (lesson_id, student_id, kind, title, how, every_day, sort_order)
select l.id, l.student_id, v.kind::public.assignment_kind, v.title, v.how, true, v.n from l,
(values
  ('game', 'Rocket bow-hold game', 'Ten times before playing', 1),
  ('review', 'Twinkle Variation A and Song of the Wind', 'Once each, listening for a steady bow', 2),
  ('piece', 'O Come, Little Children, line 1', 'Three slow times. Pinky curved on the crossings', 3),
  ('listening', 'Book 1 recording, tracks 1 to 8', 'At dinner', 4)
) as v(kind, title, how, n);

-- Draft lesson waiting for approval, cello, Oct 25
with l as (
  insert into public.lessons (student_id, teacher_id, lesson_date, duration_minutes, status, summary, focus_points, suggestions, next_lesson_date)
  select s.id, s.teacher_id, date '2026-10-25', 25, 'draft',
    'Bow hold stayed round for the whole lesson. Played line 1 of O Come, Little Children with steady crossings and started line 2.',
    'Stop before each string crossing, feel the pinky, then cross.',
    'Review Lightly Row next lesson. Consider starting Allegro preview listening.',
    date '2026-10-26'
  from public.students s where s.instrument = 'cello'
  returning id, student_id
),
pcs as (
  insert into public.lesson_pieces (lesson_id, title, activity, notes, sort_order)
  select l.id, v.title, v.activity::public.piece_activity, v.notes, v.n from l,
  (values
    ('O Come, Little Children', 'worked_on', 'Line 1 steady, line 2 started', 1),
    ('Go Tell Aunt Rhody', 'reviewed', null, 2)
  ) as v(title, activity, notes, n)
  returning id
)
insert into public.assignments (lesson_id, student_id, kind, title, how, every_day, sort_order)
select l.id, l.student_id, v.kind::public.assignment_kind, v.title, v.how, true, v.n from l,
(values
  ('game', 'Rocket bow-hold game', 'Five times before playing', 1),
  ('piece', 'O Come, Little Children, lines 1 and 2', 'Stop before each crossing, three times', 2),
  ('review', 'Go Tell Aunt Rhody', 'Once, with long smooth bows', 3),
  ('listening', 'Book 1 recording, tracks 1 to 9', 'Any time', 4)
) as v(kind, title, how, n);

-- Practice logs for the past week
insert into public.practice_logs (student_id, practice_date, minutes, listened, parent_note)
select s.id, d.day, d.minutes, d.listened, d.note
from public.students s
join (values
  (date '2026-10-20', 15, true, null),
  (date '2026-10-21', 20, true, null),
  (date '2026-10-22', 10, false, 'Tired after school, kept it short.'),
  (date '2026-10-23', 20, true, null),
  (date '2026-10-25', 25, true, 'Rests in Cuckoo are getting better.')
) as d(day, minutes, listened, note) on true
where s.instrument = 'piano';

insert into public.practice_logs (student_id, practice_date, minutes, listened, parent_note)
select s.id, d.day, d.minutes, d.listened, d.note
from public.students s
join (values
  (date '2026-10-20', 20, true, null),
  (date '2026-10-21', 20, false, null),
  (date '2026-10-22', 15, true, 'Rushes the string crossings and gets frustrated. The game helps.'),
  (date '2026-10-23', 20, true, null),
  (date '2026-10-24', 10, true, null),
  (date '2026-10-25', 20, true, 'Bow hold looked good today.')
) as d(day, minutes, listened, note) on true
where s.instrument = 'cello';
