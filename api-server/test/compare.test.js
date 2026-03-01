const controller = require('../services/controller.js');
const compareService = require('../services/compare-service.js');
const chai = require('chai');
const expect = chai.expect;

describe('compareEntities Differencing and Truncation', () => {
  let originalGetObjectDetails;
  let originalEndpoints;

  before(() => {
    originalGetObjectDetails = controller.getObjectDetails;
    originalEndpoints = controller.endpoints;

    controller.endpoints = async () => [{ namespace: 'pdb21', connect: { poolAlias: 'pdb21' } }];
    controller.getObjectDetails = async (poolAlias, owner, type, name) => {
      if (poolAlias === 'pdb21') {
        if (name === 'PROC_SOURCE') {
          let rows = [];
          // Create a large file to exceed the 1000 char threshold.
          for (let i = 1; i <= 100; i++) {
            rows.push({ "Line": i, "Text": `Original line component ${i} with extra padding to ensure length exceeds thresholds\n` });
          }
          return [{ title: 'Source', display: ['Line', 'Text'], rows }];
        }
        if (name === 'PROC_TARGET') {
          let rows = [];
          for (let i = 1; i <= 100; i++) {
            if (i % 2 === 0) {
              rows.push({ "Line": i, "Text": `Modified line component ${i} with extra padding to ensure length exceeds thresholds\n` });
            } else {
              rows.push({ "Line": i, "Text": `Original line component ${i} with extra padding to ensure length exceeds thresholds\n` });
            }
          }
          return [{ title: 'Source', display: ['Line', 'Text'], rows }];
        }

        if (name === 'TABLE_SOURCE') {
          let rows = [];
          for (let i = 1; i <= 60; i++) {
            rows.push({ "Name": `COL${i}`, "Type": "VARCHAR2" });
          }
          return [{ title: 'Columns', display: ['Name', 'Type'], rows }];
        }

        if (name === 'TABLE_TARGET') {
          let rows = [];
          for (let i = 1; i <= 60; i++) {
            rows.push({ "Name": `COL${i}`, "Type": "NUMBER" });
          }
          return [{ title: 'Columns', display: ['Name', 'Type'], rows }];
        }
      }
      return '404';
    };
  });

  after(() => {
    controller.getObjectDetails = originalGetObjectDetails;
    controller.endpoints = originalEndpoints;
  });

  it('should generate a code patch with truncation at 1000 characters for Source text', async () => {
    const sourceReq = { db: 'pdb21', owner: 'RNTMGR2', type: 'PROCEDURE', name: 'PROC_SOURCE' };
    const targetReq = { db: 'pdb21', owner: 'RNTMGR2', type: 'PROCEDURE', name: 'PROC_TARGET' };

    const result = await compareService.compareEntities(sourceReq, targetReq);

    expect(result.rawMarkdown).to.include('```diff');
    expect(result.rawMarkdown).to.include('... (patch truncated to save space, download the file to see the full code difference)');
    expect(result.rawMarkdown.length).to.be.lessThan(2500); // Ensures it doesn't blow up MCP
  });

  it('should truncate tabular diffs at 50 rows for standard tables', async () => {
    const sourceReq = { db: 'pdb21', owner: 'RNTMGR2', type: 'TABLE', name: 'TABLE_SOURCE' };
    const targetReq = { db: 'pdb21', owner: 'RNTMGR2', type: 'TABLE', name: 'TABLE_TARGET' };

    const result = await compareService.compareEntities(sourceReq, targetReq);

    expect(result.rawMarkdown).to.include('(Truncated 10 more differences)');
    expect(result.rawMarkdown).to.include('COL50');
    expect(result.rawMarkdown).to.not.include('COL51');
  });
});
