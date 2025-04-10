const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const { coreV1Api } = require('./kube');
require('dotenv').config();

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

// AWS Configuration
AWS.config.update({ region: 'us-east-1' });

const ec2 = new AWS.EC2();
const cloudwatch = new AWS.CloudWatch();
const iam = new AWS.IAM();

// === AWS EC2 APIs ===
app.get('/api/instances', async (req, res) => {
  try {
    const data = await ec2.describeInstances().promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/terminate', async (req, res) => {
  const { instanceId } = req.body;
  try {
    const data = await ec2.terminateInstances({ InstanceIds: [instanceId] }).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', async (req, res) => {
  const { instanceId } = req.body;
  try {
    const data = await ec2.stopInstances({ InstanceIds: [instanceId] }).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/start', async (req, res) => {
  const { instanceId } = req.body;
  try {
    const data = await ec2.startInstances({ InstanceIds: [instanceId] }).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const params = {
    Namespace: 'AWS/EC2',
    MetricName: 'CPUUtilization',
    Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
    StartTime: new Date(Date.now() - 3600 * 1000),
    EndTime: new Date(),
    Period: 300,
    Statistics: ['Average']
  };
  try {
    const data = await cloudwatch.getMetricStatistics(params).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === AWS IAM APIs ===
app.get('/api/iam-users', async (req, res) => {
  try {
    const data = await iam.listUsers().promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/iam-access-keys/:userName', async (req, res) => {
  const { userName } = req.params;
  try {
    const data = await iam.listAccessKeys({ UserName: userName }).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rotate-access-key', async (req, res) => {
  const { userName } = req.body;
  try {
    const newKey = await iam.createAccessKey({ UserName: userName }).promise();
    res.json(newKey);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/delete-access-key', async (req, res) => {
  const { userName, accessKeyId } = req.body;
  try {
    const data = await iam.deleteAccessKey({ UserName: userName, AccessKeyId: accessKeyId }).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/disable-access-key', async (req, res) => {
  const { userName, accessKeyId } = req.body;
  try {
    const data = await iam.updateAccessKey({
      UserName: userName,
      AccessKeyId: accessKeyId,
      Status: 'Inactive'
    }).promise();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Kubernetes APIs ===
app.get('/api/pods', async (req, res) => {
  try {
    const result = await coreV1Api.listNamespacedPod('default');
    res.json(result.body.items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pods/:name/restart', async (req, res) => {
  const name = req.params.name;
  try {
    await coreV1Api.deleteNamespacedPod(name, 'default');
    res.json({ message: `Restarted pod ${name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pods/:name/delete', async (req, res) => {
  const name = req.params.name;
  try {
    await coreV1Api.deleteNamespacedPod(name, 'default');
    res.json({ message: `Deleted pod ${name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Vulnerability Scan API (Trivy JSON endpoint) ===
app.get('/api/vulnerabilities', async (req, res) => {
  try {
    const scanResults = require('./trivy-output.json');
    const vulnerabilities = scanResults.flatMap(result =>
      result.Vulnerabilities?.map(v => ({
        Target: result.Target,
        PkgName: v.PkgName,
        Severity: v.Severity,
        Title: v.Title
      })) || []
    );
    res.json(vulnerabilities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`DevOps Control Tower backend running on port ${port}`);
});
