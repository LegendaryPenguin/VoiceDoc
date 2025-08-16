import React from 'react';
import AppShell from '../components/AppShell';
import { Calendar, Clock, Video, Plus } from 'lucide-react';
import App from 'next/app';

const AppointmentsPage = () => {
  const upcomingAppts = [
    {
      id: 1,
      type: 'Video Consultation',
      doctor: 'Dr. Sarah Johnson',
      specialty: 'Primary Care',
      date: '2024-01-20',
      time: '2:00 PM',
      duration: '30 minutes',
    },
    {
      id: 2,
      type: 'Follow-up Call',
      doctor: 'Dr. Michael Chen',
      specialty: 'Cardiology',
      date: '2024-01-25',
      time: '10:30 AM',
      duration: '15 minutes',
    }
  ];

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Appointments</h1>
            <p className="text-gray-600">Manage your upcoming medical appointments</p>
          </div>
          <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Book Appointment
          </button>
        </div>

        {/* Upcoming Appointments */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Appointments</h2>
          <div className="space-y-4">
            {upcomingAppts.map((appt) => (
              <div 
                key={appt.id}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Video className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{appt.type}</h3>
                      <p className="text-gray-700 mb-2">{appt.doctor} - {appt.specialty}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{appt.date}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{appt.time}</span>
                        </div>
                        <span>Duration: {appt.duration}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                      Reschedule
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Join Call
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
            <Video className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Video Consultation</h3>
            <p className="text-gray-600 mb-4">Book a video call with a healthcare provider</p>
            <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
              Book Now
            </button>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
            <Clock className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Quick Consultation</h3>
            <p className="text-gray-600 mb-4">15-minute consultation for urgent questions</p>
            <button className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors">
              Book Now
            </button>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center">
            <Calendar className="w-12 h-12 text-purple-600 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Follow-up</h3>
            <p className="text-gray-600 mb-4">Schedule a follow-up for existing treatment</p>
            <button className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors">
              Schedule
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default AppointmentsPage;
