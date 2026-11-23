-- A41: profile stack chips no longer have their own visibility; each follows its group.
-- Any existing per-chip override falls back to the group setting (prod had 0 at the time).
-- The column stays (profile_stack still reads it) but is always NULL from here on.
update public.member_stack_items set visibility = null where visibility is not null;
