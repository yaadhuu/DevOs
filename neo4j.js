// ==================== neo4j.js ====================
// Neo4j connection for DevOs - Updated with your credentials

const NEO4J_URI = "neo4j+s://5347e055.databases.neo4j.io";
const NEO4J_USERNAME = "5347e055";
const NEO4J_PASSWORD = "LYiTGTpmvrKF9gvag773weJ-FCAcC1pzHFXuinpiKyU";

let driver = null;

// Initialize Neo4j Driver
async function initNeo4j() {
    if (driver) return driver;

    try {
        driver = neo4j.driver(
            NEO4J_URI,
            neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
            { 
                encrypted: "ENCRYPTION_ON",
                trust: "TRUST_ALL_CERTIFICATES" 
            }
        );

        // Quick test
        const session = driver.session();
        await session.run("RETURN 1 AS test");
        await session.close();

        console.log("✅ Successfully connected to Neo4j AuraDB (DevOs)");
        return driver;
    } catch (error) {
        console.error("❌ Neo4j Connection Failed:", error.message);
        alert("Neo4j Connection Failed! Check console for details.");
        throw error;
    }
}

// Save Pomodoro Session (Call this when timer finishes in focus.html)
async function savePomodoroSession(duration, taskTitle = "Focus Session", notes = "") {
    if (!driver) await initNeo4j();

    const session = driver.session();
    try {
        const result = await session.run(`
            MATCH (u:User {userId: 'yadhu'})
            CREATE (s:PomodoroSession {
                sessionId: randomUUID(),
                duration: $duration,
                startedAt: datetime(),
                completed: true,
                taskTitle: $taskTitle,
                notes: $notes,
                createdAt: datetime()
            })
            CREATE (u)-[:COMPLETED]->(s)
            RETURN s.sessionId AS sessionId
        `, { duration, taskTitle, notes });

        console.log(`✅ Pomodoro Session Saved: ${duration} minutes`);
        return result.records[0].get('sessionId');
    } catch (error) {
        console.error("❌ Error saving session:", error);
        throw error;
    } finally {
        await session.close();
    }
}

// Get all user data
async function getMyData() {
    if (!driver) await initNeo4j();

    const session = driver.session();
    try {
        const result = await session.run(`
            MATCH (u:User {userId: 'yadhu'})
            OPTIONAL MATCH (u)-[:OWNS]->(p:Page)
            OPTIONAL MATCH (p)-[:HAS_TASK]->(t:Task)
            OPTIONAL MATCH (u)-[:COMPLETED]->(s:PomodoroSession)
            RETURN 
                collect(DISTINCT p) AS pages,
                collect(DISTINCT t) AS tasks,
                collect(DISTINCT s) AS sessions
        `);

        const record = result.records[0];
        return {
            pages: record.get('pages').map(n => n.properties),
            tasks: record.get('tasks').map(n => n.properties),
            sessions: record.get('sessions').map(n => n.properties)
        };
    } catch (error) {
        console.error("❌ Error fetching data:", error);
        return { pages: [], tasks: [], sessions: [] };
    } finally {
        await session.close();
    }
}

// Create a new Page
async function createPage(title, content = "") {
    if (!driver) await initNeo4j();

    const session = driver.session();
    try {
        const result = await session.run(`
            MATCH (u:User {userId: 'yadhu'})
            CREATE (p:Page {
                pageId: randomUUID(),
                title: $title,
                content: $content,
                createdAt: datetime(),
                updatedAt: datetime()
            })
            CREATE (u)-[:OWNS]->(p)
            RETURN p
        `, { title, content });

        console.log(`✅ Page created: ${title}`);
        return result.records[0].get('p').properties;
    } catch (error) {
        console.error("❌ Error creating page:", error);
        throw error;
    } finally {
        await session.close();
    }
}

// Cleanup on page close
window.addEventListener('beforeunload', () => {
    if (driver) driver.close();
});

// Make functions available in HTML
window.neo4jHelper = {
    initNeo4j,
    savePomodoroSession,
    getMyData,
    createPage
};

console.log("🚀 DevOs Neo4j Helper Loaded - Ready to connect!");
