/*!
 * Copyright 2026 Visulate LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const projectsFilePath = path.join(__dirname, '../config/projects.json');

function loadProjects() {
  try {
    if (fs.existsSync(projectsFilePath)) {
      const data = fs.readFileSync(projectsFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    logger.log('error', `Error reading projects file: ${err.message}`);
  }
  return [];
}

function saveProjects(projects) {
  try {
    fs.writeFileSync(projectsFilePath, JSON.stringify(projects, null, 2), 'utf8');
  } catch (err) {
    logger.log('error', `Error writing projects file: ${err.message}`);
    throw err;
  }
}

function getProjects() {
  return loadProjects();
}

function getProjectById(projectId) {
  const projects = loadProjects();
  return projects.find(p => p.projectId === projectId) || null;
}

function getProjectByDbConnection(dbConnectionId) {
  const projects = loadProjects();
  return projects.find(p => p.dbConnectionId === dbConnectionId) || null;
}

function upsertProject(projectData) {
  const projects = loadProjects();
  const index = projects.findIndex(p => 
    (projectData.projectId && p.projectId === projectData.projectId) ||
    (projectData.dbConnectionId && p.dbConnectionId === projectData.dbConnectionId)
  );
  
  const updatedProject = {
    projectId: projectData.projectId || `proj-${Date.now()}`,
    name: projectData.name || `${projectData.dbConnectionId || 'db'} (${projectData.repoFolder || 'repo'})`,
    dbConnectionId: projectData.dbConnectionId || '',
    repoFolder: projectData.repoFolder || projectData.projectId || '',
    gitRepo: {
      remoteUrl: projectData.gitRepo?.remoteUrl || '',
      defaultBranch: projectData.gitRepo?.defaultBranch || 'main',
      activeBranch: projectData.gitRepo?.activeBranch || 'main',
      credentialsId: projectData.gitRepo?.credentialsId || ''
    }
  };

  if (index >= 0) {
    projects[index] = { ...projects[index], ...updatedProject };
  } else {
    projects.push(updatedProject);
  }

  saveProjects(projects);
  return updatedProject;
}

function deleteProject(projectId) {
  const projects = loadProjects();
  const filtered = projects.filter(p => p.projectId !== projectId);
  saveProjects(filtered);
}

module.exports = {
  getProjects,
  getProjectById,
  getProjectByDbConnection,
  upsertProject,
  deleteProject
};
