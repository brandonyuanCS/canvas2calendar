/* eslint-disable */
import { useState } from 'react';

const API_URL = 'http://localhost:3001/api'; // Adjust to your backend URL

export default function Popup() {
  const [logs, setLogs] = useState<string[]>([]);
  const [token, setToken] = useState<string>('');

  const log = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      const data = await response.json();
      log(`${options.method || 'GET'} ${endpoint}: ${response.status} - ${JSON.stringify(data).substring(0, 80)}...`);
      console.log('Full response:', data);
      return data;
    } catch (error) {
      log(`ERROR`);
      console.error(error);
    }
  };

  // Auth
  const startAuth = () => {
    window.open(`${API_URL}/auth/google`, '_blank');
    log('Opened OAuth flow - check the new tab');
  };

  // Calendar
  const getCalendar = () => apiCall('/calendar');
  const createCalendar = () =>
    apiCall('/calendar', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Canvas Sync Calendar',
        description: 'Calendar synced from Canvas ICS feed',
      }),
    });

  // Events
  const getEvents = () => apiCall('/calendar/event');

  const createEvent = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    const endTime = new Date(tomorrow);
    endTime.setHours(15, 0, 0, 0);

    await apiCall('/calendar/event', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Event - CSCE 314 Lecture',
        description: 'This is a test event from the extension',
        start_time: tomorrow.toISOString(),
        end_time: endTime.toISOString(),
        is_all_day: false,
        location: 'ZACH 310',
      }),
    });
  };

  const createAllDayEvent = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await apiCall('/calendar/event', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Assignment Due - MATH 221',
        description: 'Homework 5 due',
        start_time: today.toISOString(),
        end_time: today.toISOString(),
        is_all_day: true,
      }),
    });
  };

  // Task Lists
  const getTaskLists = () => apiCall('/taskList');

  const createTaskList = () =>
    apiCall('/taskList', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Assignments',
      }),
    });

  // Tasks (you'll need to get a taskListId first)
  const [taskListId, setTaskListId] = useState('');

  const getTasks = async () => {
    if (!taskListId) {
      log('ERROR: Enter a task list ID first');
      return;
    }
    await apiCall(`/taskList/${taskListId}/item`);
  };

  const createTask = async () => {
    if (!taskListId) {
      log('ERROR: Enter a task list ID first');
      return;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    await apiCall(`/taskList/${taskListId}/item`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Complete CSCE 314 Assignment 3',
        notes: 'Functional programming exercises',
        due_date: dueDate.toISOString(),
      }),
    });
  };

  const createUrgentTask = async () => {
    if (!taskListId) {
      log('ERROR: Enter a task list ID first');
      return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await apiCall(`/taskList/${taskListId}/item`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Study for MATH 221 Quiz',
        notes: 'Chapters 4-5',
        due_date: tomorrow.toISOString(),
      }),
    });
  };

  return (
    <div className="max-h-[600px] w-[500px] overflow-y-auto p-4">
      <h1 className="mb-4 text-xl font-bold">API Test Panel</h1>

      {/* Token Input */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium">Access Token:</label>
        <input
          type="text"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Paste token here after OAuth"
          className="w-full rounded border p-2 text-sm"
        />
      </div>

      {/* Auth Section */}
      <section className="mb-4 rounded border p-3">
        <h2 className="mb-2 font-bold">🔐 Auth</h2>
        <button onClick={startAuth} className="btn-primary">
          1. Start OAuth Flow
        </button>
        <p className="mt-1 text-xs text-gray-500">After OAuth, paste the token above</p>
      </section>

      {/* Calendar Section */}
      <section className="mb-4 rounded border p-3">
        <h2 className="mb-2 font-bold">📅 Calendar</h2>
        <div className="space-y-2">
          <button onClick={createCalendar} className="btn-primary">
            Create Calendar
          </button>
          <button onClick={getCalendar} className="btn-secondary">
            Get Calendar
          </button>
        </div>
      </section>

      {/* Events Section */}
      <section className="mb-4 rounded border p-3">
        <h2 className="mb-2 font-bold">📆 Events</h2>
        <div className="space-y-2">
          <button onClick={createEvent} className="btn-primary">
            Create Event (Tomorrow 2-3pm)
          </button>
          <button onClick={createAllDayEvent} className="btn-primary">
            Create All-Day Event (Today)
          </button>
          <button onClick={getEvents} className="btn-secondary">
            Get All Events
          </button>
        </div>
      </section>

      {/* Task Lists Section */}
      <section className="mb-4 rounded border p-3">
        <h2 className="mb-2 font-bold">📋 Task Lists</h2>
        <div className="space-y-2">
          <button onClick={createTaskList} className="btn-primary">
            Create Task List
          </button>
          <button onClick={getTaskLists} className="btn-secondary">
            Get Task Lists
          </button>
        </div>
      </section>

      {/* Tasks Section */}
      <section className="mb-4 rounded border p-3">
        <h2 className="mb-2 font-bold">✅ Tasks</h2>
        <input
          type="text"
          value={taskListId}
          onChange={e => setTaskListId(e.target.value)}
          placeholder="Task List ID (from Get Task Lists)"
          className="mb-2 w-full rounded border p-2 text-sm"
        />
        <div className="space-y-2">
          <button onClick={getTasks} className="btn-secondary">
            Get Tasks in List
          </button>
          <button onClick={createTask} className="btn-primary">
            Create Task (Due in 3 days)
          </button>
          <button onClick={createUrgentTask} className="btn-primary">
            Create Urgent Task (Due tomorrow)
          </button>
        </div>
      </section>

      {/* Logs */}
      <section className="rounded border bg-gray-50 p-3">
        <h2 className="mb-2 font-bold">📝 Logs</h2>
        <button onClick={() => setLogs([])} className="mb-2 text-xs text-red-500">
          Clear Logs
        </button>
        <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
          {logs.map((log, i) => (
            <div key={i} className="font-mono">
              {log}
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .btn-primary {
          width: 100%;
          padding: 8px;
          background: #3b82f6;
          color: white;
          border-radius: 4px;
          font-size: 14px;
        }
        .btn-primary:hover {
          background: #2563eb;
        }
        .btn-secondary {
          width: 100%;
          padding: 8px;
          background: #e5e7eb;
          color: #374151;
          border-radius: 4px;
          font-size: 14px;
        }
        .btn-secondary:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
}
