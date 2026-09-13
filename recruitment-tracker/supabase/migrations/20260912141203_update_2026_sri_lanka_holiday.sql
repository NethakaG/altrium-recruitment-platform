-- Gazette Extraordinary No. 2485/14 moved the Day Following Vesak public
-- holiday from 2 May 2026 to 31 May 2026.
delete from public.calendar_holidays
where holiday_date = '2026-05-02'
  and name = 'Day Following Vesak Full Moon Poya Day';

insert into public.calendar_holidays (holiday_date, name)
values ('2026-05-31', 'Day Following Vesak Full Moon Poya Day')
on conflict (holiday_date) do update set name = excluded.name;
