# Roles / permissions — RFC
SOURCE S06 разделяет партнёра и сотрудника Билайна, назначение КАМ, риск medium, модерацию и team blocking. Точные role names/grants ниже предложены, не реализованы в HTML.

| Action | Owner/admin | Offer editor | Orders ops | Finance | Developer | Viewer | Internal |
|---|---|---|---|---|---|---|---|
| Профиль draft | RW | R | R | R* | R | R | КАМ R; risk/legal approve |
| Акцепт документов | при полномочиях | — | — | — | — | — | legal manages versions |
| Команда/роли | RW | — | — | — | — | — | authorised IAM admin |
| Офферы/codes | RW | RW | R* | R | R | R | moderator approves; ops emergency pause |
| Campaign request | RW | RW | — | R | — | R | CVM approves/executes |
| Заказ confirm/fulfil | W | — | W | R | API scope* | R* | ops per workflow |
| Возврат request | W* | — | W* | W* | — | — | finance/payment actual processing |
| Settlement/report | R | — | — | R/export/dispute | — | R* | finance approve, payment service execute |
| API config/keys/test | RW* | — | — | — | RW | — | integration ops |
| Support/messages | RW | own offer* | own order* | finance* | tech* | R* | support owner |
| Accept medium risk | — | — | — | — | — | — | designated risk approver |
| Publish offer | request | request | — | — | — | — | moderation + channel service |
| Audit | tenant R* | — | — | finance R* | tech R* | — | compliance / admin scope |

*Grant/detail OPEN; минимум необходимых данных. Partner owner не значит authorised signatory. Finance доступ к банковским реквизитам ограничен отдельным permission. Developer видит технические metadata, не raw ПДн. Internal access tenant-scoped по assignment или explicit privileged scope; нельзя default all partners.

## Enforcement
Сервер проверяет user status, membership, tenant, permission, entity state, expected_version. Object ID чужого tenant →404; запрещённое действие над своим →403. Audit allow/deny для sensitive commands. Secret rotation требует elevated permission, audit; secrets не возвращать GET list. Last owner protection; block user revokes sessions/invitations; integration credentials lifecycle управляется отдельно.
Финансы: maker-checker для bank change/payout approve; partner не approves payment execution. В HTML лишь надпись «Администратор», нет auth/RBAC.
