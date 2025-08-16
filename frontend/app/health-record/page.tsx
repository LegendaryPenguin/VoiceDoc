import React from 'react';
import AppShell from '../components/AppShell';
import { FileText, Heart, Activity, Weight, Thermometer } from 'lucide-react';

const HealthRecordPage = () => {
  const healthData = [
    { label: 'Blood Pressure', value: '120/80 mmHg', icon: Heart, status: 'normal' },
    { label: 'Heart Rate', value: '72 bpm', icon: Activity, status: 'normal' },
    { label: 'Weight', value: '165 lbs', icon: Weight, status: 'normal' },
    { label: 'Temperature', value: '98.6°F', icon: Thermometer, status: 'normal' },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Health Record</h1>
          <p className="text-gray-600">Your personal health information and medical history</p>
        </div>

        {/* Vital Signs */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Latest Vital Signs</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {healthData.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                  <Icon className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                  <div className="text-2xl font-bold text-gray-900 mb-1">{item.value}</div>
                  <div className="text-sm text-gray-600 mb-2">{item.label}</div>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                    Normal
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Medical History */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Medical History</h2>
          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-medium text-gray-900">Annual Checkup</h3>
              <p className="text-sm text-gray-600 mt-1">January 10, 2024 - Dr. Smith</p>
              <p className="text-gray-700 mt-2">Routine physical examination. All vitals normal.</p>
            </div>
            <div className="border-l-4 border-yellow-500 pl-4">
              <h3 className="font-medium text-gray-900">Blood Work</h3>
              <p className="text-sm text-gray-600 mt-1">December 15, 2023 - Lab Results</p>
              <p className="text-gray-700 mt-2">Complete blood count and metabolic panel within normal ranges.</p>
            </div>
          </div>
        </div>

        {/* Allergies & Medications */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Allergies</h2>
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                <span className="font-medium text-red-800">Penicillin</span>
                <p className="text-sm text-red-600 mt-1">Severe allergic reaction</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <span className="font-medium text-yellow-800">Pollen</span>
                <p className="text-sm text-yellow-600 mt-1">Seasonal allergies</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Medications</h2>
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <span className="font-medium text-blue-800">Vitamin D3</span>
                <p className="text-sm text-blue-600 mt-1">1000 IU daily</p>
              </div>
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                <span className="font-medium text-green-800">Multivitamin</span>
                <p className="text-sm text-green-600 mt-1">Once daily with breakfast</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HealthRecordPage;