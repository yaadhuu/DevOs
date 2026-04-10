const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');

const app = express();
app.use(cors());
app.use(express.json());

// Neo4j connection
const NEO4J_URI = 'neo4j+s://5347e055.databases.neo4j.io';
const NEO4J_USERNAME = '5347e055';
const NEO4J_PASSWORD = 'LYiTGTpmvrKF9gvag773weJ-FCAcC1pzHFXuinpiKyU';

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

// Lazy seed — only runs once
let seeded = false;
async function ensureSeed() {
    if (seeded) return;
    seeded = true;
    const session = driver.session();
    try {
        const check = await session.run('MATCH (n) RETURN count(n) as count');
        const count = check.records[0].get('count').toNumber();
        if (count === 0) {
            await session.run(`
                CREATE (u:User {name: 'DevOS User', id: 'user_1'})
                CREATE (t1:Task {title: 'Finalize School Project', status: 'pending', id: randomUUID()})
                CREATE (t2:Task {title: 'Review Neo4j Integration', status: 'completed', id: randomUUID()})
                CREATE (t3:Task {title: 'Prepare Presentation', status: 'pending', id: randomUUID()})
                CREATE (n1:Note {content: 'Neo4j uses Cypher query language.', timestamp: timestamp(), id: randomUUID()})
                CREATE (n2:Note {content: 'Focus on presentation tomorrow.', timestamp: timestamp(), id: randomUUID()})
                CREATE (u)-[:HAS_TASK]->(t1)
                CREATE (u)-[:HAS_TASK]->(t2)
                CREATE (u)-[:HAS_TASK]->(t3)
                CREATE (u)-[:WROTE_NOTE]->(n1)
                CREATE (u)-[:WROTE_NOTE]->(n2)
            `);
        }
    } catch (e) { console.error('Seed error:', e); }
    finally { await session.close(); }
}

// TASKS
app.get('/api/tasks', async (req, res) => {
    await ensureSeed();
    const session = driver.session();
    try {
        const result = await session.run("MATCH (t:Task) RETURN t ORDER BY t.id DESC");
        const tasks = result.records.map(r => r.get('t').properties);
        res.json({ success: true, tasks });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    finally { await session.close(); }
});

app.post('/api/tasks', async (req, res) => {
    const { title } = req.body;
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (u:User) CREATE (t:Task {title: $title, status: 'pending', id: randomUUID()}) CREATE (u)-[:HAS_TASK]->(t) RETURN t`,
            { title }
        );
        res.json({ success: true, task: result.records[0].get('t').properties });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    finally { await session.close(); }
});

// NOTES
app.get('/api/notes', async (req, res) => {
    await ensureSeed();
    const session = driver.session();
    try {
        const result = await session.run("MATCH (n:Note) RETURN n ORDER BY n.timestamp DESC");
        const notes = result.records.map(r => r.get('n').properties);
        res.json({ success: true, notes });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    finally { await session.close(); }
});

app.post('/api/notes', async (req, res) => {
    const { content } = req.body;
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (u:User) CREATE (n:Note {content: $content, timestamp: timestamp(), id: randomUUID()}) CREATE (u)-[:WROTE_NOTE]->(n) RETURN n`,
            { content }
        );
        res.json({ success: true, note: result.records[0].get('n').properties });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    finally { await session.close(); }
});

// FOCUS
app.post('/api/focus', async (req, res) => {
    const { durationMinutes } = req.body;
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (u:User) CREATE (f:FocusSession {duration: $durationMinutes, timestamp: timestamp(), id: randomUUID()}) CREATE (u)-[:COMPLETED_FOCUS]->(f) RETURN f`,
            { durationMinutes }
        );
        res.json({ success: true, session: result.records[0].get('f').properties });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    finally { await session.close(); }
});

// GRAPH QUERY
app.post('/api/query', async (req, res) => {
    await ensureSeed();
    const { cypher } = req.body;
    const session = driver.session();
    try {
        const result = await session.run(cypher);
        const nodes = [];
        const edges = [];
        const seenNodes = new Set();

        result.records.forEach(record => {
            record.keys.forEach(key => {
                const field = record.get(key);
                if (!field) return;
                if (field.identity !== undefined && field.labels !== undefined) {
                    const id = field.identity.toNumber();
                    if (!seenNodes.has(id)) {
                        seenNodes.add(id);
                        const props = {};
                        Object.keys(field.properties).forEach(k => {
                            const v = field.properties[k];
                            props[k] = (v && v.toNumber) ? v.toNumber() : v;
                        });
                        nodes.push({ id, labels: field.labels, properties: props });
                    }
                }
                if (field.type !== undefined && field.start !== undefined && field.end !== undefined) {
                    const props = {};
                    Object.keys(field.properties).forEach(k => {
                        const v = field.properties[k];
                        props[k] = (v && v.toNumber) ? v.toNumber() : v;
                    });
                    edges.push({ from: field.start.toNumber(), to: field.end.toNumber(), type: field.type, properties: props });
                }
                if (field.segments !== undefined) {
                    field.segments.forEach(seg => {
                        [seg.start, seg.end].forEach(node => {
                            const nid = node.identity.toNumber();
                            if (!seenNodes.has(nid)) {
                                seenNodes.add(nid);
                                const p = {};
                                Object.keys(node.properties).forEach(k => { const v = node.properties[k]; p[k] = (v && v.toNumber) ? v.toNumber() : v; });
                                nodes.push({ id: nid, labels: node.labels, properties: p });
                            }
                        });
                        const rp = {};
                        Object.keys(seg.relationship.properties).forEach(k => { const v = seg.relationship.properties[k]; rp[k] = (v && v.toNumber) ? v.toNumber() : v; });
                        edges.push({ from: seg.relationship.start.toNumber(), to: seg.relationship.end.toNumber(), type: seg.relationship.type, properties: rp });
                    });
                }
            });
        });
        res.json({ success: true, nodes, edges, recordCount: result.records.length });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
    finally { await session.close(); }
});

module.exports = app;
