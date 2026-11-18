-- Деньги: номера счетов, причина неудачной оплаты, минимальное пополнение.
create sequence invoice_number_seq;
alter table payments add column failure_reason text;
insert into settings (key, value) values ('min_topup_kop', '100000'); -- 1 000 ₽
