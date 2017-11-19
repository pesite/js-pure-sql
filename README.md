# Pure SQL

Write your sql just as sql. Then use it.

> _**Note**:_
> This is highly similar to a slightly more feature-rich and two weeks older [puresql](https://github.com/neonerd/puresql).
> That's a mere coincidence. We just seem to have had the same idea and came up with the same name.

## How to use

Assume you have some sql code as follows:

`./sql/user.sql`
```sql
-- name: getUser
SELECT id, name FROM "user" WHERE id = $1;

-- name: updateUserName
UPDATE "user" SET name = $2 WHERE id = $1
RETURNING id, name;
```

And you want to run that in your application.

`./someApp.js`
```js
// purely illustrative example that does not run without db config
const pureSql = require('pure-sql');
const path = require('path');

// Load templates.
const templates = pureSql.parseTemplateFiles(path.resolve(__dirname, './sql'), '.sql');

// Create some postgresql client for testing.
const Client = require('pg').Client;
const client = new Client();

client.connect();

// User.
const user = {id: 'testUserId', name: 'testName'};

client.query(templates.updateUserName, [user.id, user.name], (err, res) => {
  console.log(err ? err.stack : res.rows[0].message);
  client.end()
});

console.log(templates) // {getUser: 'SELECT id, name FROM "user" WHERE id = $1;', updateUserName: 'UPDATE "user" SET name = $2 WHERE id = $1\nRETURNING id, name;'}
```

## What's so spectacular about that?

Nothing really. At least, not yet. It could do more as below, but that pure version works in almost
any case you want.

For example, however, if you really want a bit more and you happen to use something like `pg`:

`./sql/user.sql`
```sql
-- name: getUser
SELECT id, name FROM "user" WHERE id = {id};

-- name: updateUserName
UPDATE "user" SET name = {name} WHERE id = {id}
RETURNING id, name;
```
`./someApp.js`
```js
// purely illustrative example that does not run without db config
const pureSql = require('pure-sql');
const path = require('path');

// Load templates.
const templates = pureSql.PG.parseTemplateFiles(path.resolve(__dirname, './sql'), '.sql');

// Create some postgresql client for testing.
const Client = require('pg').Client;
const client = new Client();

client.connect();

// User.
const user = {id: 'testUserId', name: 'testName'};

client.query(templates.updateUserName.query, templates.updateUserName.map(user), (err, res) => {
  console.log(err ? err.stack : res.rows[0].message);
  client.end()
});
```

## For installation

`npm install pure-sql`

## Inspiration

This library is inspired by the clojure library [hugsql](https://github.com/layerware/hugsql)
