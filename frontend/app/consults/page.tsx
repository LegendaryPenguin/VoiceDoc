import React from 'react';
import AppShell from '../components/AppShell';
import { Clock, MessageCircle, User } from 'lucide-react';
import App from 'next/app';

const ConsultsPage = () => {
  const consultHistory = [
    {
      id: 1,
      date: '2024-01-15',
      time: '2:30 PM',
      topic: 'Headache and fatigue symptoms',
      duration: '8 minutes',
      status: 'Completed'
    },
    {
      id: 2,
      date: '2024-01-10',
      time: '10:15 AM',
      topic: 'Follow-up on sleep issues',
      duration: '6 minutes',
      status: 'Completed'
    },
    {
      id: 3,
      date: '2024-01-05',
      time: '4:45 PM',
      topic: 'Questions about medication side effects',
      duration: '12 minutes',
      status: 'Completed'
    }
  ];

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Consults</h1>
          <p className="text-gray-600">View your consultation history and access previous conversations</p>
        </div>

        <div className="space-y-4">
          {consultHistory.map((consult) => (
            <div 
              key={consult.id}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-2">{consult.topic}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{consult.date} at {consult.time}</span>
                      </div>
                      <span>Duration: {consult.duration}</span>
                    </div>
                  </div>
                </div>
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  {consult.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {consultHistory.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">No consults yet</h3>
            <p className="text-gray-500 mb-6">Start your first consultation to see your history here</p>
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Start New Consult
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default ConsultsPage;
